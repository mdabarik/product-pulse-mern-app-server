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

/** --------Utils IsExpired Date or Not-------- **/
const moment = require('moment');
// function isDateExpired(inputDate) {
//     // Convert the input date string to a Moment.js object
//     var inputMoment = moment(inputDate, 'YYYY-MM-DD');
//     // Get the current date with Moment.js
//     var currentMoment = moment();
//     // Compare the input date with the current date
//     return inputMoment.isBefore(currentMoment);
// }
function isDateExpired(inputDate) {
    // Convert the input date string to a Moment.js object
    var inputMoment = moment(inputDate, 'YYYY-MM-DD');
    // Get the current date with Moment.js
    var currentMoment = moment().subtract(1, 'days');
    // Compare the input date with the current date
    return inputMoment.isBefore(currentMoment);
}

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
            // console.log('/users', user);
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
            const result = await usersCollection.find().sort({ userRole: 1 }).toArray();
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
            // console.log(email, userRole, 'inside patch users/email');
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


        /*----------------- Start Votes(Upvotes, Downvotes) Related API's ------------------- ********/
        const votesCollection = client.db("ProductPulseDB").collection("votes");
        app.get('/get-votes', async (req, res) => {
            const prodId = req.query.id;
            const queryUpvote = {
                prodId: prodId,
                types: 'upvote'
            }
            const queryDownvote = {
                prodId: prodId,
                types: 'downvote'
            }
            // console.log(queryUpvote, queryDownvote);
            const countUpvotes = await votesCollection.countDocuments(queryUpvote);
            const countDownvotes = await votesCollection.countDocuments(queryDownvote);
            const votes = {
                upvotes: countUpvotes,
                downvotes: countDownvotes
            }
            // console.log('votes', votes);
            res.send(votes);
        })

        // /get-user-votes
        app.get('/get-user-votes', async (req, res) => {
            const prodId = req.query.id;
            const email = req.query.email;
            const queryUpvote = {
                prodId: prodId,
                userEmail: email,
                types: 'upvote'
            }
            const queryDownvote = {
                prodId: prodId,
                userEmail: email,
                types: 'downvote',
            }
            // console.log(queryUpvote, queryDownvote, 'inside get-user-votes');
            const countUpvotes = await votesCollection.countDocuments(queryUpvote);
            const countDownvotes = await votesCollection.countDocuments(queryDownvote);
            const votes = {
                upvotes: countUpvotes,
                downvotes: countDownvotes
            }
            // console.log('user votes', votes);
            res.send(votes);
        })

        app.put('/add-or-update', async (req, res) => {
            const body = req.body;
            console.log(body, 'addorupdate');
            const updatedDoc = {
                $set: {
                    userEmail: body?.userEmail,
                    prodId: body?.prodId,
                    types: body?.types
                }
            }
            const filter = {
                userEmail: body?.userEmail,
                prodId: body?.prodId,
            };
            const result = await votesCollection.updateOne(filter, updatedDoc, { upsert: true });
            // console.log(result, 'result add or update');
            res.send(result)
        })

        app.post('/votes', async (req, res) => {
            const body = req.body;
            const votes = {
                userEmail: body?.userEmail,
                prodId: body?.prodId,
                types: body?.types
            }
            const result = await votesCollection.insertOne(votes);
            // console.log('/votes route', result);
            res.send(result)
        })

        app.put('/votes', async (req, res) => {
            const body = req.body;
            const updatedDoc = {
                $set: {
                    userEmail: body?.userEmail,
                    prodId: body?.prodId,
                    types: body?.types
                }
            }
            const filter = {
                userEmail: body?.userEmail,
                prodId: body?.prodId,
            };
            const result = await votesCollection.updateOne(filter, updatedDoc, { upsert: true });
            res.send(result)
        })

        app.get('/votes', async (req, res) => {
            const id = req?.query?.id;
            const email = req?.query?.email;
            // console.log(req.query, 'query');
            const query = {
                prodId: id,
                userEmail: email,
                types: 'upvote'
            }
            const result = await votesCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/count-votes/:id', async (req, res) => {
            const id = req?.params?.id;
            const query = {
                prodId: id,
                types: 'upvote'
            }
            const result = await votesCollection.find(query).toArray();
            res.send(result);
        })
        /*--------------- End Votes(Upvotes, Downvotes) Related API's ---------------*/


        /*-------- products related api's ---------*/
        const productsCollection = client.db("ProductPulseDB").collection("products");
        app.post('/products', verifyToken, async (req, res) => {
            const newProduct = req.body;
            // console.log(newProduct);
            const result = await productsCollection.insertOne(newProduct);
            res.send(result);
        })

        app.get('/get-featured-products', async (req, res) => {
            const limit = parseInt(req.query.limit);
            const query = {
                prodIsFeatured: 'yes',
                prodStatus: 'accepted'
            }
            const result = await productsCollection.find(query).toArray();
            res.send(result);
        })


        app.get('/get-trending-products', async (req, res) => {
            try {
                const pipeline = [
                    {
                        $lookup: {
                            from: 'votes',
                            let: { productId: '$_id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ['$prodId', { $toString: '$$productId' }]
                                        }
                                    }
                                }
                            ],
                            as: 'votes'
                        }
                    },
                    {
                        $unwind: {
                            path: '$votes',
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $group: {
                            _id: '$_id',
                            prodName: { $first: '$prodName' },
                            prodDesc: { $first: '$prodDesc' },
                            prodImg: { $first: '$prodImg' },
                            prodExtLink: { $first: '$prodExtLink' },
                            prodTags: { $first: '$prodTags' },
                            prodOwnerInfo: { $first: '$prodOwnerInfo' },
                            prodStatus: { $first: '$prodStatus' },
                            prodUpvotes: { $sum: { $cond: { if: { $eq: ['$votes.types', 'upvote'] }, then: 1, else: 0 } } },
                            prodDownvotes: { $sum: { $cond: { if: { $eq: ['$votes.types', 'downvote'] }, then: 1, else: 0 } } },
                            prodIsFeatured: { $first: '$prodIsFeatured' },
                            prodAddedAt: { $first: '$prodAddedAt' }
                        }
                    },
                    {
                        $sort: { prodUpvotes: -1 }
                    },
                    {
                        $limit: 4
                    }
                ];

                const result = await productsCollection.aggregate(pipeline).toArray();
                console.log(result, 'from pipeline');

                if (result.length === 0) {
                    console.log('No products found.');
                }

                res.send(result);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            }
        });

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
            // console.log(req.params.id);
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
            // console.log('coupon patch id,', product);
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
            // console.log('coupon patch id,', product);
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
            // console.log('coupon patch id,', product);
            const updatedDoc = {
                $set: {
                    prodIsFeatured: product?.prodIsFeatured
                }
            }
            const result = await productsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.patch('/report-prod/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    prodIsReported: 'yes'
                }
            }
            const result = await productsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // /get-all-reported-products
        app.get('/get-all-reported-products', verifyToken, async (req, res) => {
            const result = await productsCollection.find({ 'prodIsReported': 'yes' }).toArray();
            res.send(result);
        })

        app.get('/all-products-public', async (req, res) => {
            const page = parseInt(req?.query?.page) - 1;
            const limit = parseInt(req?.query?.limit);
            const search = req?.query?.search;
            const skip = page * limit;

            let query = {
                prodStatus: 'accepted'
            }

            const result = await productsCollection.find(query).skip(skip).limit(limit).toArray();

            // console.log(result, 'result pagin');
            res.send(result);
        })

        // /get-all-accpeted-products
        app.get('/get-all-accpeted-products', async (req, res) => {
            const search = req?.query?.search;
            let query = {
                prodStatus: 'accepted',
                prodTags: { $in: [search] }
            }
            const result = await productsCollection.find(query).toArray();
            // console.log(result, 'acccptlkajdf jadf');
            res.send(result);
        })

        app.get('/verified-prods', async (req, res) => {
            let query = {
                prodStatus: 'accepted',
            }
            const result = await productsCollection.find(query).toArray();
            console.log(result, 'res adf adf');
            res.send(result);
        })

        app.get('/count-accepted-prods', async (req, res) => {
            const search = req?.query?.search;
            let query = {
                prodStatus: 'accepted'
            }
            if (search != 'null' && search.trim() != '') {
                // console.log('serach key', search);
                query = {
                    prodStatus: 'accepted',
                    prodTags: { $in: [search] }
                }
            }
            // console.log(search, 'serach key');
            const count = await productsCollection.countDocuments(query)
            res.send({ count });
        })

        app.get('/single-prod/:id', async (req, res) => {
            // console.log(req.params.id);
            const id = req.params.id;
            const query = { _id: new ObjectId(id), prodStatus: 'accepted' };
            const result = await productsCollection.findOne(query);
            res.send(result);
        })


        /*-------- coupons related api's ---------*/
        const couponsCollection = client.db("ProductPulseDB").collection("coupons");

        app.get('/get-coupon', async (req, res) => {
            // console.log(rq.);
            const couponCode = req.query.code;
            const query = {
                couponCode: couponCode
            }
            const result = await couponsCollection.find(query).toArray();
            console.log(result, 'result....');
            let details = {};
            if (parseInt(result[0]?.discAmount) > 0) {
                details = {
                    discount: parseInt(result[0]?.discAmount)
                }
            }
            res.send(details);
        })


        app.get('/all-coupons/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // console.log(email, 'req, users/');
            const result = await couponsCollection.find().toArray();
            res.send(result);
        })

        app.get('/get-active-token', async (req, res) => {
            const result = await couponsCollection.find().toArray();
            // extract active coupons
            const activeCoupon = result?.filter(coupon => {
                // console.log('coupon');
                return !isDateExpired(coupon?.expireDate)
            })
            res.send(activeCoupon);
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
            // console.log('coupon patch id,', item);
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
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // console.log(amount, 'amount inside the intent')
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
            res.send({ paymentResult });
        })
        /*----------------- End Payment Related API's ------------------- ********/






        /*----------------- Review Related Api's ------------------- */
        const reviewsCollection = client.db("ProductPulseDB").collection("reviews");
        app.put('/add-review', async (req, res) => {
            const review = req.body;
            // console.log(review, 'review');
            const filter = {
                userEmail: review?.userEmail,
                productId: review?.productId
            };
            const updatedDoc = {
                $set: {
                    userName: review.userName,
                    userEmail: review.userEmail,
                    userPhoto: review.userPhoto,
                    userRating: review.userRating,
                    userComment: review.userComment,
                    productId: review.productId,
                },
            };
            const result = await reviewsCollection.updateOne(filter, updatedDoc, { upsert: true });
            res.send(result)
        })

        app.get('/review', async (req, res) => {
            const id = req.query.id;
            const email = req.query.email;
            const query = {
                productId: id,
                userEmail: email,
            }
            // console.log(query, 'query, review');
            const result = await reviewsCollection.findOne(query);
            res.send(result);
        })

        // get all reviews of a product
        app.get('/get-all-reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                productId: id
            }
            console.log(query, 'query get llalal');
            const result = await reviewsCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/all-reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                productId: id
            }
            const result = await reviewsCollection.find(query).toArray();

            const sumUserRating = result.reduce((sum, review) => sum + review.userRating, 0);
            // console.log(sumUserRating);

            const prodRating = {
                numRating: result.length,
                averageRating: sumUserRating / result.length
            }
            res.send(prodRating)
        })



        /*----------------- Admin Stats Related Api's ------------------- */
        // /admin-stats
        app.get('/admin-stats', async (req, res) => {
            // total user *
            // total products *
            // total accepted products
            // total pending products
            // total rejected products
            // total reviews *
            const totalUsers = await usersCollection.countDocuments();
            const totalProducts = await productsCollection.countDocuments();
            const totalReviews = await reviewsCollection.countDocuments();
            const totalAcceptedProds = await productsCollection.countDocuments({ prodStatus: 'accepted' });
            const totalPendingProds = await productsCollection.countDocuments({ prodStatus: 'pending' });
            const totalRejectedProds = await productsCollection.countDocuments({ prodStatus: 'Rejected' });
            const totalReportedProds = await productsCollection.countDocuments({ prodIsReported: 'yes' });
            const doc = {
                users: totalUsers,
                products: totalProducts,
                reviews: totalReviews,
                pendingProd: totalPendingProds,
                rejectedProd: totalRejectedProds,
                acceptedProd: totalAcceptedProds,
                reportedProd: totalReportedProds
            }
            console.log('doc,', doc);
            res.send(doc);
        })
        app.get('/moderator-stats', async (req, res) => {
            // total user *
            // total products *
            // total accepted products
            // total pending products
            // total rejected products
            // total reviews *
            const totalUsers = await usersCollection.countDocuments();
            const totalProducts = await productsCollection.countDocuments();
            const totalReviews = await reviewsCollection.countDocuments();
            const totalAcceptedProds = await productsCollection.countDocuments({ prodStatus: 'accepted' });
            const totalPendingProds = await productsCollection.countDocuments({ prodStatus: 'pending' });
            const totalRejectedProds = await productsCollection.countDocuments({ prodStatus: 'Rejected' });
            const totalReportedProds = await productsCollection.countDocuments({ prodIsReported: 'yes' });
            const doc = {
                users: totalUsers,
                products: totalProducts,
                reviews: totalReviews,
                pendingProd: totalPendingProds,
                rejectedProd: totalRejectedProds,
                acceptedProd: totalAcceptedProds,
                reportedProd: totalReportedProds
            }
            console.log('doc,', doc);
            res.send(doc);
        })
        app.get('/user-stats', async (req, res) => {
            // total user *
            // total products *
            // total accepted products
            // total pending products
            // total rejected products
            // total reviews *
            const email = req.query.email;
            const totalUsers = await usersCollection.countDocuments();
            const totalProducts = await productsCollection.countDocuments();
            const totalReviews = await reviewsCollection.countDocuments();
            const totalAcceptedProds = await productsCollection.countDocuments({ prodStatus: 'accepted', 'prodOwnerInfo.email': email });
            const totalPendingProds = await productsCollection.countDocuments({ prodStatus: 'pending', 'prodOwnerInfo.email': email });
            const totalRejectedProds = await productsCollection.countDocuments({ prodStatus: 'Rejected', 'prodOwnerInfo.email': email });
            const totalReportedProds = await productsCollection.countDocuments({ prodIsReported: 'yes', 'prodOwnerInfo.email': email });
            const doc = {
                users: totalUsers,
                products: totalProducts,
                reviews: totalReviews,
                pendingProd: totalPendingProds,
                rejectedProd: totalRejectedProds,
                acceptedProd: totalAcceptedProds,
                reportedProd: totalReportedProds
            }
            console.log('doc,', doc);
            res.send(doc);
        })

        /*******------Report Related Apis-------******* */
        const reportsCollection = client.db("ProductPulseDB").collection("reports");
        app.get('/is-reported', async (req, res) => {
            const query = {
                prodId: req.query.id,
                userEmail: req.query.email
            }
            console.log('ispreort', query);
            const counts = await reportsCollection.countDocuments(query);
            const result = {
                isReported: counts != 0
            }
            res.send(result)
        })

        app.post('/report-prod', async (req, res) => {
            const reportDoc = req.body;
            console.log(reportDoc);
            const result = await reportsCollection.insertOne(reportDoc);
            res.send(result);
        })

        app.get('/reported-products', async (req, res) => {
            try {
                const pipeline = [
                    {
                        $group: {
                            _id: '$prodId'
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            prodId: { $toString: '$_id' } // Convert ObjectId to string
                        }
                    }
                ];

                const reportedProductIds = await reportsCollection.aggregate(pipeline).toArray();

                const reportedProducts = await productsCollection.find({
                    $expr: {
                        $in: [
                            { $toString: '$_id' }, // Convert ObjectId to string
                            reportedProductIds.map(p => p.prodId)
                        ]
                    }
                })
                    //   .sort({ reportedAt: -1 }) // Add this line to sort by reportedAt in descending order
                    .toArray();

                if (reportedProducts.length === 0) {
                    console.log('No reported products found.');
                    res.json([]); // Send an empty array or another appropriate response
                } else {
                    res.json(reportedProducts);
                }
            } catch (error) {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            }
        });



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