const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
require("dotenv").config();


const app = express();

const server = http.createServer(app);


app.use(cors({
    origin:"*"
}));

app.use(express.json());


const io = new Server(server,{
    cors:{
        origin:"*"
    }
});



// =======================
// DATABASE
// =======================


const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});




// =======================
// FILE UPLOAD
// =======================


const storage = multer.diskStorage({

    destination:"uploads/",

    filename:(req,file,cb)=>{

        cb(
            null,
            Date.now()+"-"+file.originalname
        );

    }

});


const upload = multer({
    storage
});


app.use(
    "/uploads",
    express.static("uploads")
);





const SECRET =
process.env.JWT_SECRET ||
"novachat-secret";





console.log(
"NovaChat Pro starting..."
);
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
require("dotenv").config();


const app = express();

const server = http.createServer(app);


app.use(cors({
    origin:"*"
}));

app.use(express.json());


const io = new Server(server,{
    cors:{
        origin:"*"
    }
});



// =======================
// DATABASE
// =======================


const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});




// =======================
// FILE UPLOAD
// =======================


const storage = multer.diskStorage({

    destination:"uploads/",

    filename:(req,file,cb)=>{

        cb(
            null,
            Date.now()+"-"+file.originalname
        );

    }

});


const upload = multer({
    storage
});


app.use(
    "/uploads",
    express.static("uploads")
);





const SECRET =
process.env.JWT_SECRET ||
"novachat-secret";





console.log(
"NovaChat Pro starting..."
);
// =======================
// USERS API
// =======================


app.get("/users", async(req,res)=>{


const result = await pool.query(`

SELECT 

id,
username,
avatar,
bio,
status,
last_seen,
created_at

FROM users

ORDER BY id DESC

`);


res.json(result.rows);


});







// =======================
// UPDATE PROFILE
// =======================


app.put("/profile/:id", async(req,res)=>{


const {

username,

avatar,

bio

}=req.body;



const result =
await pool.query(

`

UPDATE users

SET

username=$1,

avatar=$2,

bio=$3

WHERE id=$4

RETURNING *

`,

[

username,

avatar,

bio,

req.params.id

]

);



res.json(result.rows[0]);


});








// =======================
// UPLOAD AVATAR
// =======================


app.post(

"/upload/:id",

upload.single("avatar"),

async(req,res)=>{


const url =

"/uploads/" + req.file.filename;



await pool.query(

`

UPDATE users

SET avatar=$1

WHERE id=$2

`,

[

url,

req.params.id

]

);



res.json({

avatar:url

});


});










// =======================
// CHAT HISTORY
// =======================


app.get("/messages",async(req,res)=>{


const result =
await pool.query(

`

SELECT *

FROM messages

ORDER BY created_at ASC

LIMIT 200

`

);



res.json(result.rows);


});









// =======================
// PRIVATE HISTORY
// =======================


app.get(

"/private/:one/:two",

async(req,res)=>{


const result =
await pool.query(

`

SELECT *

FROM private_messages

WHERE

(sender_id=$1 AND receiver_id=$2)

OR

(sender_id=$2 AND receiver_id=$1)

ORDER BY created_at ASC


`,

[

req.params.one,

req.params.two

]

);



res.json(result.rows);


});







// =======================
// ONLINE USERS
// =======================


let onlineUsers=[];
// =======================
// SOCKET.IO CHAT
// =======================


io.on("connection",(socket)=>{


console.log(
"User connected"
);





// USER ONLINE

socket.on("online", async(user)=>{


socket.user=user;



await pool.query(

`

UPDATE users

SET

status='online',

last_seen=NOW()

WHERE id=$1

`,

[user.id]

);





onlineUsers.push({

id:user.id,

username:user.username,

avatar:user.avatar,

socket:socket.id

});



io.emit(

"onlineUsers",

onlineUsers

);



});








// PUBLIC MESSAGE


socket.on(

"message",

async(data)=>{


const result =

await pool.query(

`

INSERT INTO messages

(
sender_id,
username,
text
)

VALUES($1,$2,$3)

RETURNING *

`,

[

data.sender_id,

data.username,

data.text

]

);



io.emit(

"message",

result.rows[0]

);


});









// PRIVATE MESSAGE


socket.on(

"privateMessage",

async(data)=>{


const result =

await pool.query(

`

INSERT INTO private_messages

(
sender_id,
receiver_id,
sender_name,
text
)

VALUES($1,$2,$3,$4)

RETURNING *

`,

[

data.sender_id,

data.receiver_id,

data.sender_name,

data.text

]

);



const receiver =

onlineUsers.find(

u=>u.id===data.receiver_id

);



if(receiver){


io.to(receiver.socket)

.emit(

"privateMessage",

result.rows[0]

);


}



});









// TYPING


socket.on(

"typing",

(data)=>{


socket.broadcast.emit(

"typing",

data

);


});








// REACTION


socket.on(

"reaction",

async(data)=>{


await pool.query(

`

INSERT INTO reactions

(
message_id,
user_id,
reaction
)

VALUES($1,$2,$3)

`,

[

data.message_id,

data.user_id,

data.reaction

]

);



io.emit(

"reaction",

data

);


});








// DISCONNECT


socket.on(

"disconnect",

async()=>{


if(socket.user){


await pool.query(

`

UPDATE users

SET

status='offline',

last_seen=NOW()

WHERE id=$1

`,

[socket.user.id]

);


}





onlineUsers =

onlineUsers.filter(

u=>u.socket!==socket.id

);



io.emit(

"onlineUsers",

onlineUsers

);



console.log(

"User disconnected"

);



});



});








// =======================
// START SERVER
// =======================


createTables()

.then(()=>{


server.listen(

process.env.PORT || 10000,

()=>{


console.log(

"NovaChat Pro server started"

);


});


});
