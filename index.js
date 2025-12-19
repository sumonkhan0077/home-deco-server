const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.abef6se.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("export import server is running ");
});

async function run() {
  try {
    // await client.connect();

    const db = client.db("home_deco");
    const servicesCollection = db.collection("services");

    app.post("/services", async (req, res) => {
      const newServices = req.body;
      const result = await servicesCollection.insertOne(newServices);
      res.send(result);
    });

    app.get("/services", async (req, res) => {
      try {
        const search = req.query.search;
        const type = req.query.type; // category
        const limit = parseInt(req.query.limit) || 0;
        const min = parseInt(req.query.min);
        const max = parseInt(req.query.max);
        const query = {};

        if (search) {
          query.service_name = { $regex: search, $options: "i" }; 
        }
        if (type) {
          query.service_category = { $regex: type, $options: "i" };
        }
        if (!isNaN(min) || !isNaN(max)) {
          query["costs.0"] = {};

          if (!isNaN(min)) {
            query["costs.0"].$gte = min;
          }
          if (!isNaN(max)) {
            query["costs.0"].$lte = max;
          }
        }

        const result = await servicesCollection
          .find(query)
          .sort({ rating: -1 }) 
          .limit(limit)
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).send({ error: "Server error" });
      }
    });

    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.get("/top_rating", async (req, res) => {
      const cursor = servicesCollection.find().sort({ rating: -1 }).limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    //  await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
