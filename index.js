import express from "express";
import connection from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import dotenv from "dotenv";
import fs from "fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

dotenv.config();

const app = express();
const port = 3002;
const saltRounds = 10;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
    session({
        secret: "topsecret",
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: null } 
    })
);
app.use(passport.session());
app.use(passport.initialize());

const destinations = [
    { name: "Mumbai", image: "/images/mumbai.jpg" },
    { name: "Delhi", image: "/images/delhi.jpg" },
    { name: "Goa", image: "/images/goa.jpg" }
];

const buses = [
    { name: "Redline Express", route: "Delhi → Mumbai", price: 1500, image: "/images/bus1.jpg" },
    { name: "Blue Star Travels", route: "Bangalore → Hyderabad", price: 1200, image: "/images/bus2.jpeg" },
    { name: "Green Metro", route: "Chennai → Pune", price: 1800, image: "/images/bus3.jpg" }
];

app.get("/", (req, res) => {
    let userdetail = req.isAuthenticated() ? req.user.username : null;
    if (userdetail && userdetail.includes("@")) {
        userdetail = userdetail.split("@")[0];
    }
    res.render("index", { destinations, buses, userdetail });
});

const destination = [
    { name: "Diu", image: "/images/mumbai.jpg" },
    { name: "Hyderabad", image: "/images/delhi.jpg" }
];

const buse = [
    { name: "Sunrise Tours", route: "Diu → Hyderabad", price: 2500, image: "/images/bus1.jpg" },
    { name: "Royal Express", route: "Diu → Hyderabad", price: 2300, image: "/images/bus2.jpeg" },
    { name: "Silver Line Travels", route: "Hyderabad → Diu", price: 2700, image: "/images/bus3.jpg" },
    { name: "Blue Star Coaches", route: "Hyderabad → Diu", price: 2600, image: "/images/bus2.jpeg" },
    { name: "FastTrack Bus", route: "Diu → Hyderabad", price: 2400, image: "/images/bus1.jpg" }
];

app.get("/search",(req,res)=>{
    const query = req.query.q ? req.query.q.toLowerCase() : "";
    if (query === "diu") {
        res.render("diu", { destination, buse });
    } else if(query==="hyderabad"){
        res.render("hyderabad",{ destination, buse });
    }
    else{
        res.send("Invalid search");
    }
    
})


app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));

app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
    "/auth/google/authen",
    passport.authenticate("google", {
        successRedirect: "/",
        failureRedirect: "/login",
    })
);

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/",
        failureRedirect: "/login",
    })
);

app.post("/signup", async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await connection.execute("SELECT * FROM users WHERE username = ?", [username]);

        if (users.length > 0) {
            return res.redirect("/login");
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        await connection.execute("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);

        res.redirect("/");
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).send("Internal Server Error");
    }
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect("/login");
}

app.get("/book", ensureAuthenticated, async (req, res) => {
    const { bus, route, price } = req.query;
    const userdetail = req.user.username;

    try {
        const [bookings] = await connection.execute(
            "SELECT seats FROM payments WHERE bus = ? AND route = ?",
            [bus, decodeURIComponent(route)]
        );

        const reservedSeats = bookings.flatMap(booking => {
            try {
                return booking.seats ? JSON.parse(booking.seats) : [];
            } catch (error) {
                console.error("Error parsing seats JSON:", error);
                return [];
            }
        }).map(seat => parseInt(seat, 10));

        res.render("booking", {
            busName: bus,
            busRoute: route,
            busPrice: price,
            userdetail,
            reservedSeats
        });
    } catch (error) {
        console.error("Error fetching reserved seats:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/payment", ensureAuthenticated, async (req, res) => {
    const { bus, route, price, seats } = req.body;
    const user_id = req.user.id;
    const username = req.user.username;

    let passengers = [];
    seats.split(",").forEach((seat, index) => {
        passengers.push({
            name: req.body[`passenger${index + 1}-name`],
            age: req.body[`passenger${index + 1}-age`]
        });
    });

    try {
        const paymentStatus = 'Success'; 
        const seatsArray = JSON.stringify(seats.split(",")); 
        const decodedRoute = decodeURIComponent(route);
        const passengersJSON = JSON.stringify(passengers); 

        await connection.execute(
            "INSERT INTO payments (user_id, username, bus, route, price, seats, payment_status, seat_reserved, passengers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [user_id, username, bus, decodedRoute, price, seatsArray, paymentStatus, 1, passengersJSON]
        );

        res.redirect(`/summary?bus=${encodeURIComponent(bus)}&route=${encodeURIComponent(decodedRoute)}&price=${price}&seats=${seatsArray}&status=${paymentStatus}&passengers=${encodeURIComponent(passengersJSON)}`);
    } catch (error) {
        console.error("Error during payment processing:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/summary", ensureAuthenticated, (req, res) => {
    const { bus, route, price, seats, status, passengers } = req.query;

    try {
        const passengersData = JSON.parse(decodeURIComponent(passengers)); 

        res.render("summary", {
            bus,
            route,
            price,
            seats,
            status,
            passengers: passengersData, 
        });
    } catch (error) {
        console.error("Error parsing passengers:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/download-ticket", ensureAuthenticated, async (req, res) => {
    const { bus, route, price, seats, status, passengers } = req.query;
    
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const filename = `ticket_${Date.now()}.pdf`;
    const qrText = `Bus: ${bus}, Route: ${route}, Price: ₹${price}, Seats: ${seats}, Status: ${status}`;

    const ticketsDir = path.join(__dirname, "tickets");

    if (!fs.existsSync(ticketsDir)) {
        fs.mkdirSync(ticketsDir, { recursive: true });
    }

    const qrCodePath = path.join(ticketsDir, `qr_${Date.now()}.png`);

    try {
        await QRCode.toFile(qrCodePath, qrText, { width: 150 });

        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        res.setHeader("Content-Type", "application/pdf");

        doc.pipe(res);
        doc.font("Helvetica-Bold").fontSize(22).fillColor("#007bff").text("Bus Ticket", { align: "center" });
        doc.moveDown();

        doc.font("Helvetica").fontSize(14).fillColor("#000");
        doc.text(`Bus: ${bus}`);
        doc.text(`Route: ${route}`);
        doc.text(`Price: ₹${price} per seat`);
        doc.text(`Seats: ${seats.replace(/[\[\]"]+/g, '')}`);
        doc.text(`Status: ${status}`);
        doc.moveDown();

        doc.font("Helvetica-Bold").fontSize(16).fillColor("#007bff").text("Passenger Details:");
        doc.moveDown();

        let passengerData;
        try {
            passengerData = JSON.parse(decodeURIComponent(passengers));
            doc.font("Helvetica").fontSize(12).fillColor("#000");
            passengerData.forEach((passenger, index) => {
                doc.text(`Passenger ${index + 1}: ${passenger.name}, Age: ${passenger.age}`);
            });
        } catch (error) {
            console.error("Error parsing passenger details:", error);
            doc.fontSize(14).text("Error loading passenger details.");
        }

        doc.image(qrCodePath, 380, 140, { width: 120 });

        doc.end();
    } catch (error) {
        console.error("Error generating QR code:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});

passport.use(
    "local",
    new Strategy(async function (username, password, done) {
        try {
            const [users] = await connection.execute("SELECT * FROM users WHERE username = ?", [username]);
            if (users.length > 0) {
                const isMatch = await bcrypt.compare(password, users[0].password);
                return isMatch ? done(null, users[0]) : done(null, false);
            }
            return done(null, false);
        } catch (error) {
            console.error(error);
            return done(error);
        }
    })
);

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:3002/auth/google/authen",
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const [users] = await connection.execute("SELECT * FROM users WHERE username = ?", [profile.email]);
                if (users.length > 0) {
                    return done(null, users[0]);
                } else {
                    await connection.execute("INSERT INTO users(username, password) VALUES (?, ?)", [profile.email, "google"]);
                    const [newUser] = await connection.execute("SELECT * FROM users WHERE username = ?", [profile.email]);
                    return done(null, newUser[0]);
                }
            } catch (err) {
                console.error(err);
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser(async (user, done) => {
    try {
        const [users] = await connection.execute("SELECT * FROM users WHERE username = ?", [user.username]);
        if (users.length === 0) {
            return done(null, false);  
        }
        done(null, users[0]);
    } catch (err) {
        done(err, null);
    }
});