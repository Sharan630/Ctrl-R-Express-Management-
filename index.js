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
import env from "dotenv";

const app = express();
const port = 3002;
const saltRounds = 10;
env.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
    session({
        secret: "topsecret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: false,
            secure: false,
            maxAge: null,
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
    { name: "Blue Star Travels", route: "Bangalore → Hyderabad", price: 1200, image: "/images/bus2.jpg" },
    { name: "Green Metro", route: "Chennai → Pune", price: 1800, image: "/images/bus3.jpg" }
];

// Routes
app.get("/", (req, res) => {
    res.render("index", { destinations, buses });
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/dashboard", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("dashboard");
    } else {
        res.redirect("/login");
    }
});

// 🔹 Google OAuth Authentication Route
app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

// 🔹 Google OAuth Callback Route
app.get(
    "/auth/google/authen",
    passport.authenticate("google", {
        successRedirect: "/dashboard",
        failureRedirect: "/login",
    })
);

// 🔹 Local Login Route
app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/dashboard",
        failureRedirect: "/login",
    })
);

// 🔹 Local Signup Route
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
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// 🔹 Passport Local Strategy
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

// 🔹 Passport Google OAuth Strategy
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

// 🔹 Serialize & Deserialize User
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});
