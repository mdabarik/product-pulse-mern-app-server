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

        /*--------middlewares---------*/
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

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            // console.log('veryfiy adming', req.decoded);
            const query = { userEmail: email };
            const user = await usersCollection.findOne(query);
            // console.log(user, 'user verfad');
            const isAdmin = user?.userRole === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        /*-------- users related api's ---------*/
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log('/users', user);
            const query = { userEmail: user?.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.get('/users/:email', async (req, res) => {
            const email = req?.params?.email;
            // console.log('users/email', email);
            const result = await usersCollection.findOne({ userEmail: email })
            // console.log(result);
            res.send(result);
        })

        app.get('/all-users/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // console.log(email, 'req, users/');
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.patch('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const userRole = req.body.userRole;
            const filter = { userEmail: email };
            const updatedDoc = {
                $set: {
                    userRole: userRole
                }
            }
            const result = await usersCollection.updateMany(filter, updatedDoc);
            console.log(email, userRole, 'inside patch users/email');
            res.send(result)
        })

        /*-------- products related api's ---------*/


        /*-------- coupons related api's ---------*/


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