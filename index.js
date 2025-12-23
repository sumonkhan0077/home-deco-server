const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
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

const admin = require("firebase-admin");

const serviceAccount = require("./home-deco-firebase-adminsdk-fbsvc.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("export import server is running ");
});

function generateTrackingId() {
  const prefix = "BDX-";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `${prefix}${date}-${randomPart}`;
}

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    // await client.connect();

    const db = client.db("home_deco");
    const servicesCollection = db.collection("services");
    const usersCollection = db.collection("users");
    const bookingCollection = db.collection("booking");
    const paymentCollection = db.collection("payments");
    const decoratorsCollection = db.collection("decorators");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

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
      const cursor = usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,

      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDocor = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await usersCollection.updateOne(query, updatedDocor);
        res.send(result);
      }
    );

    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
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

    app.post("/decorator", verifyFBToken, async (req, res) => {
      const newDecorator = req.body;

      const userExist = await decoratorsCollection.findOne({
        email: newDecorator.email,
      });
      if (userExist) {
        return res.send({ message: "You already Exist" });
      }
      newDecorator.applyStatus = "pending";
      const result = await decoratorsCollection.insertOne(newDecorator);
      res.send(result);
    });

    app.get("/decorators", async (req, res) => {
      const category = req.query.category;
      const query = {};
      if (category) {
        query.service_type = category;
        query.applyStatus = "accepted";
      }
      const result = await decoratorsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete(
      "/decorator/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await decoratorsCollection.deleteOne(query);
        res.send(result);
      }
    );

    app.patch(
      "/decorator/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const { status, email } = req.body;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set:
           { 
            applyStatus: status,
            workStatus:"available",
           },

        };
        const result = await decoratorsCollection.updateOne(query, update);

        // update user role
        if (status === "accepted") {
          const query = {};
          if (email) {
            query.email = email;
          }
          const updateRole = {
            $set: { role: "decorator" },
          };
          const userResult = await usersCollection.updateOne(query, updateRole);
        }
        res.send(result);
      }
    );

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const trackingId = generateTrackingId();

      booking.createdAt = new Date();
      booking.trackingId = trackingId;
      booking.paymentStatus = "pending";

      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/dashboard/my-bookings", async (req, res) => {
      const email = req.query.email;
      const sort = req.query.sort || "desc";

      const query = {};
      if (email) {
        query.email = email;
      }

      const sortValue = sort === "desc" ? -1 : 1;

      const result = await bookingCollection
        .find(query)
        .sort({ createdAt: sortValue })
        .toArray();

      const totalBooking = await bookingCollection.countDocuments(query);

      res.send({ result, totalBooking });
    });

   
     app.get('/bookings', verifyFBToken, verifyAdmin, async (req, res) => {
      const serviceWorkStatus = req.query.serviceWorkStatus
      const query = {}
      if (serviceWorkStatus) {
        query.serviceWorkStatus = serviceWorkStatus
      }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

      app.patch('/booking/:id', async (req, res) => {
      const id = req.params.id
      const assignDecoratorInfo = req.body
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { ...assignDecoratorInfo, serviceWorkStatus: "assign" }
      }
      const result = await bookingCollection.updateOne(query, update)
      res.send(result)
    })

    app.get("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    app.delete("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const result = await bookingCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // paymant
    app.post("/payment-checkout-session", async (req, res) => {
      const packageInfo = req.body;
      const amount = parseInt(packageInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${packageInfo.service_name}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: packageInfo.email,
        metadata: {
          servicesId: packageInfo.servicesId,
          trackingId: packageInfo.trackingId,
          bookingId: packageInfo.bookingId,
          service_name: packageInfo.service_name,
        },

        success_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send(session.url);
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent;
        const query = { transactionId: transactionId };

        const paymentExist = await paymentCollection.findOne(query);
        if (paymentExist) {
          return res.send({
            message: "already exists",
            transactionId,
            trackingId: paymentExist.trackingId,
          });
        }

        const trackingId = session.metadata.trackingId;
        const bookingId = session.metadata.bookingId;
        const servicesId = session.metadata.servicesId;
        const service_name = session.metadata.service_name;

        if (session.payment_status === "paid") {
          await bookingCollection.updateOne(
            { _id: new ObjectId(bookingId) },
            {
              $set: {
                paymentStatus: "paid",
                serviceWorkStatus:"pending",
                transactionId,
                paidAt: new Date(),
              },
            }
          );

          const payment = {
            bookingId,
            trackingId,
            transactionId,
            servicesId,
            service_name,
            amount: session.amount_total / 100,
            currency: session.currency,
            email: session.customer_email,
            paidAt: new Date(),
          };

          await paymentCollection.insertOne(payment);

          return res.send({
            success: true,
            transactionId,
            trackingId,
          });
        }

        res.send({ success: false });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Payment success error" });
      }
    });

    app.get("/payment-history", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const sort = req.query.sort || "desc";

      const query = {};
      if (email) {
        query.email = email;
        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }

      const sortValue = sort === "desc" ? -1 : 1;

      const result = await paymentCollection
        .find(query)
        .sort({ paidAt: sortValue })
        .toArray();

      const paymentHistory = await paymentCollection.countDocuments(query);

      res.send({ result, paymentHistory });
    });

    app.patch("/services/:id", async (req, res) => {
      const id = req.params.id;
      const updatedService = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: { 
          service_name: updatedService.service_name,
          image: updatedService.image,
          costs: updatedService.costs,
          currency: updatedService.currency,
          unit: updatedService.unit,
          service_category: updatedService.service_category,
          service_type: updatedService.service_type,
          description: updatedService.description,
          time: updatedService.time,
          rating: updatedService.rating,
          createdByEmail: updatedService.createdByEmail,
        },
      };
      const result = await servicesCollection.updateOne(query, update);
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

    app.delete(
      "/services/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await servicesCollection.deleteOne(query);
        res.send(result);
      }
    );

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
