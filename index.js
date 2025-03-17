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

        const reservedSeats = bookings
            .flatMap(booking => JSON.parse(booking.seats))
            .map(seat => parseInt(seat, 10));

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

    try {
        const paymentStatus = 'Success'; 
        const seatsArray = JSON.stringify(seats.split(","));
        const decodedRoute = decodeURIComponent(route);

        await connection.execute(
            "INSERT INTO payments (user_id, username, bus, route, price, seats, payment_status, seat_reserved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [user_id, username, bus, decodedRoute, price, seatsArray, paymentStatus, 1]
        );

        res.redirect(`/summary?bus=${encodeURIComponent(bus)}&route=${encodeURIComponent(decodedRoute)}&price=${price}&seats=${seatsArray}&status=${paymentStatus}`);
    } catch (error) {
        console.error("Error during payment processing:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.get("/summary", (req, res) => {
    const { bus, route, price, seats, status } = req.query;
    res.render("summary", { bus, route, price, seats, status });
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