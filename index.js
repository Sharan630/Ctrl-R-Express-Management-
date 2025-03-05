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
        secret: process.env.SESSION_SECRET || "topsecret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 1000,
        },
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

        res.redirect("/login");
    } catch (error) {
        console.error("Error during signup:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/book", (req, res) => {
    const { bus, route, price } = req.query;
    res.render("booking", { 
        busName: bus, 
        busRoute: route, 
        busPrice: price 
    });
});

app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});

passport.use(
    new Strategy(async function (username, password, done) {
        try {
            const [users] = await connection.execute("SELECT * FROM users WHERE username = ?", [username]);
            if (users.length > 0) {
                const isMatch = await bcrypt.compare(password, users[0].password);
                return isMatch ? done(null, users[0]) : done(null, false);
            }
            return done(null, false);
        } catch (error) {
            console.error("Error during local strategy:", error);
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
                console.error("Error during Google OAuth strategy:", err);
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));