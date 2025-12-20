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
    const usersCollection = db.collection("users");

    // users related apis
    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        // query.displayName = {$regex: searchText, $options: 'i'}
        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }
      const cursor = userCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.post("/services", async (req, res) => {
      const newServices = req.body;
      const result = await servicesCollection.insertOne(newServices);
      res.send(result);
    });


    

    app.get("/services", async (req, res) => {
      const { search, type, limit, min, max } = req.query;
      const query = {};
      if (search) {
        query.service_name = { $regex: search, $options: "i" };
      }
      if (type) {
        query.service_category = { $regex: type, $options: "i" };
      }
      const minVal = parseInt(min);
      const maxVal = parseInt(max);

      if (!isNaN(minVal) && !isNaN(maxVal)) {
        costs = { $elemMatch: { $gte: minVal, $lte: maxVal } };
      } else if (!isNaN(minVal)) {
        query.costs = { $gte: minVal };
      } else if (!isNaN(maxVal)) {
        query.costs = { $lte: maxVal };
      }

      try {
        const result = await servicesCollection
          .find(query)
          .limit(parseInt(limit) || 0)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching services" });
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
