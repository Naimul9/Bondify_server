const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Verify token middleware
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'forbidden access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ahphq0t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db('Bondify').collection('users');
    const friendRequests = client.db('Bondify').collection('friendrequests');
    const friendsCollection = client.db('Bondify').collection('allfriends');

    // JWT generation
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      });
      res.send({ token });
    });

    // Save or update user
    app.put('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // Get all users
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Send a friend request
    app.post('/sendFriendRequest', async (req, res) => {
      const { currentUserEmail, friendId, friendEmail, Name, Photo } = req.body;

      if (currentUserEmail == friendEmail) {
        return res.status(400).send({ message: 'Invalid Request' });
      }

      if (!currentUserEmail || !friendId) {
        return res.status(400).send({ message: 'Missing required fields' });
      }

      try {
        // Check if the friend request already exists
        const existingRequest = await friendRequests.findOne({
          Email: currentUserEmail,
          receiverId: new ObjectId(friendId),
        });

        if (existingRequest) {
          return res.status(400).send({ message: 'Friend request already sent' });
        }

        // Create a new friend request
        const friendRequest = {
          Email: currentUserEmail,
          Name: Name,
          Photo: Photo,
          receiverId: new ObjectId(friendId),
          status: 'pending', // initial status
          receiverMail: friendEmail,
          timestamp: Date.now(),
        };

        const result = await friendRequests.insertOne(friendRequest);
        res.send({ success: true, result });
      } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // Get friend requests
    app.get('/friendRequests/:email', async (req, res) => {
        const { email } = req.params;
        try {
            // Fetch only pending requests
            const pendingRequests = await friendRequests.find({receiverMail: email,  status: 'pending' }).toArray();
            res.send(pendingRequests);
        } catch (error) {
            console.error('Error fetching friend requests:', error);
            res.status(500).send('Error fetching friend requests');
        }
    });
   
    //get all friends for specific email with status accepted
    app.get('/friends/:email', async (req, res) => {
        const { email } = req.params;
        
        try {
            // Find requests where the current user (receiver) has received the request and the status is 'accepted'
            const acceptedFriends = await friendRequests.find({
                receiverMail: email, // Current user is the receiver
                status: 'accepted'   // Status is accepted
            }).toArray();
            
            res.send(acceptedFriends);
        } catch (error) {
            console.error('Error fetching friends:', error);
            res.status(500).send('Error fetching friends');
        }
    });

    
    
    
    

    // Accept a friend request and update the status
    app.put('/updateFriendRequestStatus', async (req, res) => {
      const { requestId } = req.body;

      if (!requestId) {
        return res.status(400).send({ message: 'Missing request ID' });
      }

      try {
        // Update the status of the friend request to 'accepted'
        const updateResult = await friendRequests.updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { status: 'accepted' } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(400).send({ message: 'Friend request not found or already accepted' });
        }

        res.send({ success: true, message: 'Friend request accepted' });
      } catch (error) {
        console.error('Error updating friend request status:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });


       // Decline a friend request and update the status
       app.put('/declineFriendRequest', async (req, res) => {
        const { requestId } = req.body;
  
        if (!requestId) {
          return res.status(400).send({ message: 'Missing request ID' });
        }
  
        try {
          // Update the status of the friend request to 'declined'
          const updateResult = await friendRequests.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { status: 'declined' } }
          );
  
          if (updateResult.modifiedCount === 0) {
            return res.status(400).send({ message: 'Friend request not found or already processed' });
          }
  
          res.send({ success: true, message: 'Friend request declined' });
        } catch (error) {
          console.error('Error declining friend request:', error);
          res.status(500).send({ message: 'Internal Server Error' });
        }
      });


      // Unfriend API - Change the status from 'accepted' to 'unfriended'
app.put('/unfriend', async (req, res) => {
    const { requestId } = req.body;

    try {
        const result = await friendRequests.updateOne(
            { _id: new ObjectId(requestId), status: 'accepted' },
            { $set: { status: 'unfriended' } }
        );

        if (result.modifiedCount > 0) {
            res.send({ success: true, message: 'Unfriended successfully' });
        } else {
            res.status(404).send({ success: false, message: 'No accepted friend request found' });
        }
    } catch (error) {
        console.error('Error unfriending:', error);
        res.status(500).send('Error unfriending');
    }
});


    

    // Logout
    app.get('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 0,
      }).send({ success: true });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Close the client when necessary
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Bondify is running');
});

app.listen(port, () => {
  console.log(`Bondify is running on port ${port}`);
});
