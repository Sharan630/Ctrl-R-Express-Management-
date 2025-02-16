import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 3002;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

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

app.get("/", (req, res) => {
    res.render("index", { destinations, buses });
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
