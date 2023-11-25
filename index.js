const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 8888;

/*------middleware-----*/
app.use(cors());
app.use(express.json());

/*------MongoDB Database-----*/
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
            console.log('users/email', email);
            const result = await usersCollection.findOne({ userEmail: email })
            console.log(result);
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

        // /user-subscription
        app.patch('/user-subscription/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            // const userRole = req.body.userRole;
            const filter = { userEmail: email };
            const updatedDoc = {
                $set: {
                    status: 'Verified',
                    isSubscribed: 'yes'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            // console.log(email, userRole, 'inside patch users/email');
            res.send(result)
        })




        /*-------- products related api's ---------*/
        const productsCollection = client.db("ProductPulseDB").collection("products");
        app.post('/products', verifyToken, async (req, res) => {
            const newProduct = req.body;
            console.log(newProduct);
            const result = await productsCollection.insertOne(newProduct);
            res.send(result);
        })

        app.get('/all-products/:email', verifyToken, async (req, res) => {
            const email = req?.params?.email;
            const result = await productsCollection.find({ 'prodOwnerInfo.email': email }).sort({ prodStatus: -1 }).toArray();
            res.send(result);
        })

        app.get('/get-all-products', verifyToken, async (req, res) => {
            const result = await productsCollection.find().sort({ prodStatus: -1 }).toArray();
            res.send(result);
        })

        // /products/
        app.delete('/products/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        })
        // /single-product/${id}
        app.get('/single-product/:id', verifyToken, async (req, res) => {
            console.log(req.params.id);
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        })
        // products
        app.patch('/products/:id', async (req, res) => {
            const product = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            console.log('coupon patch id,', product);
            const updatedDoc = {
                $set: {
                    prodName: product?.prodName,
                    prodDesc: product?.prodDesc,
                    prodImg: product?.prodImg,
                    prodExtLink: product?.prodExtLink,
                    prodTags: product?.prodTags,
                }
            }
            const result = await productsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.patch('/products/update-status/:id', async (req, res) => {
            const product = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            console.log('coupon patch id,', product);
            const updatedDoc = {
                $set: {
                    prodStatus: product?.prodStatus
                }
            }
            const result = await productsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.patch('/products/update-feature/:id', async (req, res) => {
            const product = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            console.log('coupon patch id,', product);
            const updatedDoc = {
                $set: {
                    prodIsFeatured: product?.prodIsFeatured
                }
            }
            const result = await productsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })
        // /get-all-reported-products
        app.get('/get-all-reported-products', verifyToken, async (req, res) => {
            const result = await productsCollection.find({ 'prodIsReported': 'yes' }).toArray();
            res.send(result);
        })



        /*-------- coupons related api's ---------*/
        const couponsCollection = client.db("ProductPulseDB").collection("coupons");
        app.get('/all-coupons/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // console.log(email, 'req, users/');
            const result = await couponsCollection.find().toArray();
            res.send(result);
        })

        app.delete('/coupons/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await couponsCollection.deleteOne(query);
            res.send(result);
        })

        app.post('/coupons/', verifyToken, verifyAdmin, async (req, res) => {
            const coupon = req.body;
            const result = await couponsCollection.insertOne(coupon);
            res.send(result);
        })

        app.get('/coupons/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await couponsCollection.findOne(query);
            res.send(result);
        })

        app.patch('/coupons/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            console.log('coupon patch id,', item);
            const updatedDoc = {
                $set: {
                    couponCode: item?.couponCode, expireDate: item?.expireDate, couponDesc: item?.couponDesc, discAmount: item?.discAmount
                }
            }
            const result = await couponsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        /********-------------- Start Payment Related API's ------------------- ********/
        const paymentsCollection = client.db("ProductPulseDB").collection("payments");
        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentsCollection.insertOne(payment);

            //  carefully delete each item from the cart
            // console.log('payment info', payment);
            // const query = {
            //     _id: {
            //         $in: payment.cartIds.map(id => new ObjectId(id))
            //     }
            // };

            // const deleteResult = await cartCollection.deleteMany(query);

            res.send({ paymentResult });
        })
        /*----------------- End Payment Related API's ------------------- ********/




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