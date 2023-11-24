const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 8888;

/*------middleware-----*/
app.use(cors());
app.use(express.json());

/*------MongoDB Database-----*/
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.waijmz7.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        /*--------Routes (API's) Setup-------*/
        const usersCollection = client.db("ProductPulseDB").collection("users");

        /*--------JWT API---------*/
        app.post('/jwt', async (req, res) => {
            console.log('jwt api ...');
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
            res.send({ token });
        })

        /*--------verifyToken middleware---------*/
        const verifyToken = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        /*--------Save Register User Api---------*/
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log('/users', user);
            const query = { email: user?.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
              return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally { }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Product pulse server is running...");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})