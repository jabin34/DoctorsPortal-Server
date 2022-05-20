const express = require('express');
const cors = require('cors');
const app = express(); 
const port = process.env.PORT || 4000 ;
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECTET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { get } = require('express/lib/response');
const jwt = require('jsonwebtoken');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
//middleware 
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oxihm.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
// client.connect(err => {
//   const collection = client.db("test").collection("devices");
//   // perform actions on the collection object
//   client.close();
// });
function verifyJwt(req,res,next){
    const authHeader = req.headers.authorization;

    if(!authHeader){
        return res.status(401).send({message:"Unauthorized access!!"})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token,process.env.ACCESS_TOKEN_SECRECT,function(err,decoded){
        if(err){
            res.status(403).send({message:"Forbidden !!"});
        }
        req.decoded = decoded;
        next();
    });
}
const emailSenderOptions = {
    auth: {
      api_key:process.env.DPORTAL_EMAIL_KEY
    }
  }
  const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));
function sendAppointmentEmail(booking){
const {paitent,paitentName,treatment,date,slot} = booking;
var email = {
    from:process.env.EMAIL_SENDER,
    to:paitent,
    subject: `Your Appointment for ${treatment} is on ${date} at${slot} Confirmed`,
    text: `Your Appointment for ${treatment} is on ${date} at${slot} Confirmed`,
    html: `<div>
    <p>Hello ${paitentName},</p>
    <h3>Your Appointment for${treatment} is confirmed</h3>
    <p>Looking forward to seeing you on ${date} at ${slot}</p>
    </div>`
  };
  emailClient.sendMail(email, function(err, info){
    if (err ){
      console.log(err);
    }
    else {
      console.log('Message sent: ' + info);
    }
});
  
}

function sendPaymentConfirjationEmail(booking){
    const {paitent,paitentName,treatment,date,slot} = booking;
    var email = {
        from:process.env.EMAIL_SENDER,
        to:paitent,
        subject: `We have received your payment for ${treatment} is on ${date} at${slot} Confirmed`,
        text: `Your Payment for this Appointment  ${treatment} is on ${date} at${slot} Confirmed`,
        html: `<div>
        <p>Hello ${paitentName},</p>
        <h3>Thank you for your payment</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}</p>
        </div>`
      };
      emailClient.sendMail(email, function(err, info){
        if (err ){
          console.log(err);
        }
        else {
          console.log('Message sent: ' + info);
        }
    });
      
    }



async function run(){
 try{
 await client.connect();
 console.log('db connected');
 const servicesCollection = client.db("doctors-portal").collection("services");
 const bookingCollection = client.db("doctors-portal").collection("booking");
 const userCollection = client.db("doctors-portal").collection("users");
 const doctorCollection = client.db("doctors-portal").collection("doctor");
 const paymentCollection = client.db("doctors-portal").collection("payments");

const  verifyAdmin = async( req,res,next)=>{
    const requester = req.decoded.email;
    const requesterAccount = await userCollection.findOne({email:requester});
    if(requesterAccount.role ==='admin'){
        next();
        }
        else{
            res.status(403).send({message:'forbidden'});
        }
}


 app.put('/user/:email',async(req,res)=>{
    const email = req.params.email;
    const user = req.body;
    const filter ={email:email};
    const options = {upsert:true};
    const updatedoc = {
        $set:user,
    };
    const result = await userCollection.updateOne(filter,updatedoc,options);
    const token = jwt.sign({email:email},process.env.ACCESS_TOKEN_SECRECT,{expiresIn:'1h'})
    res.send({result,token});
 });
 app.get('/service',async(req,res)=>{
     const query ={};
     const cursor = servicesCollection.find(query);
     const service = await cursor.toArray();
     res.send(service);
 });
 app.get('/services',async(req,res)=>{
    const query ={};
    const cursor = servicesCollection.find(query).project({name:1});
    const service = await cursor.toArray();
    res.send(service);
});

 app.get('/booking',verifyJwt,async(req,res)=>{
     const paitent = req.query.paitent;
      const decodedEmail = req.decoded.email;
      if(paitent === decodedEmail){
        const query ={paitent:paitent};
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      }
   else{
       return res.status(403).send({message:"Forbidden User!!"});
   }
 });
//single booking
app.get('/booking/:id',verifyJwt,async(req,res)=>{
const id = req.params.id;
const query ={_id:ObjectId(id)};
const booking = await bookingCollection.findOne(query);
console.log(booking);
res.send(booking);

});
//paid 
app.patch('/booking/:id',verifyJwt, async(req,res)=>{
    const id = req.params.id;
    const payment = req.body
    const filter = {_id: ObjectId(id)};
    const updatedoc = {
        $set:{
            paid:true,
            transactionId: payment.transactionId,
        }
    }
    const updatedBooking = await bookingCollection.updateOne(filter,updatedoc);
    const result = await paymentCollection.insertOne(payment);
    console.log( updatedBooking);
    res.send(updatedoc);
    
    });

app.post('/booking',async(req,res)=>{
 const booking = req.body;
 const query = {treatment:booking.treatment,date:booking.date,paitent:booking.paitent};
 const exist = await bookingCollection.findOne(query);
 if(exist){
     return res.send({success:false,booking:exist});
 }
 const result = await bookingCollection.insertOne(booking);
 sendAppointmentEmail(booking);
 res.send( {success:true,result});
});

app.get('/available',async(req,res)=>{
const date = req.query.date || "May 16, 2022";
const services = await servicesCollection.find().toArray();
const query ={date:date};
const bookings = await bookingCollection.find(query).toArray();

services.forEach(service =>{
    const serviceBookings = bookings.filter(b => b.treatment === service.name);
    const booked = serviceBookings.map(s => s.slot);
   // service.booked = booked;
    const available = service.slots.filter(s=>!booked.includes(s));
    service.slots = available;
});
res.send(services);
});

app.get('/user',verifyJwt, async(req,res)=>{
    const user = await userCollection.find().toArray();
    res.send(user);
});
app.put('/user/admin/:email',verifyJwt,verifyAdmin,async(req,res)=>{
    const email = req.params.email;
    
        const filter ={email:email};
        const updatedoc = {
            $set:{role:'admin'},
        };
        const result = await userCollection.updateOne(filter,updatedoc);
        res.send({result});
    });
 app.get('/admin/:email',async(req,res)=>{
    const email = req.params.email;
    const user = await userCollection.findOne({email:email});
    const isAdmin = user.role === 'admin';
    res.send({admin:isAdmin});
 });
app.post('/doctor',verifyJwt,verifyAdmin, async(req,res)=>{
    const doctor = req.body;
    const result = await doctorCollection.insertOne(doctor);
    res.send(result);

});
app.get('/doctor',verifyJwt,verifyAdmin,async(req,res)=>{
    
    const result = await doctorCollection.find().toArray();
    res.send(result);

});
app.delete('/doctor/:email',verifyJwt,verifyAdmin, async(req,res)=>{
    const email= req.params.email;
    const filter = {email:email};
    const result = await doctorCollection.deleteOne(filter);
    res.send(result);

});

//payment gateway
app.post('/create-payment-intent',verifyJwt, async(req,res)=>{
    const service = req.body;
    const price = service.price;
    const amount = price*100;
    const paymentIntent = await stripe.paymentIntents.create({
    amount:amount,
    currency:'usd',
    payment_method_types:['card']
    });
    res.send({clientSecret: paymentIntent.client_secret})
});



 }finally{

 }
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send("Hello from Doctor!!");
});

//port listening

app.listen(port,()=>{
    console.log('Doctors port listening to port',port);
});