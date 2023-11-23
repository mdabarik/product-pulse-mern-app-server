const express = require('express');
require('dotenv').config();
const port = process.env.PORT || 8888;

const app = express();


app.get('/', (req, res) => {
    res.send("Product pulse server is running...");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})