require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");


const app = express();

app.use(cors());
app.use(express.json());


const server = http.createServer(app);



const io = new Server(server, {

    cors:{
        origin:"*"
    }

});



// ============================
// DATABASE
// ============================


const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});




// ============================
// TABLES
// ============================


async function createTables(){


await pool.query(`

CREATE TABLE IF NOT EXISTS users(

id SERIAL PRIMARY KEY,

username TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

created_at TIMESTAMP DEFAULT NOW()

);

`);




await pool.query(`

CREATE TABLE IF NOT EXISTS messages(

id SERIAL PRIMARY KEY,

user_id INTEGER,

username TEXT,

text TEXT,

created_at TIMESTAMP DEFAULT NOW()

);

`);



console.log("Database ready");


}




const SECRET="NOVACHAT_SECRET_KEY";





// ============================
// HOME
// ============================


app.get("/",(req,res)=>{

res.send(
"NovaChat Backend v3 🚀"
);

});







// ============================
// REGISTER
// ============================


app.post("/register",async(req,res)=>{


try{


const {
username,
email,
password
}=req.body;



const exists =
await pool.query(

"SELECT id FROM users WHERE email=$1",

[email]

);



if(exists.rows.length){

return res.json({

error:"User already exists"

});

}




const hash =
await bcrypt.hash(
password,
10
);



const result =
await pool.query(

`

INSERT INTO users
(username,email,password)

VALUES($1,$2,$3)

RETURNING id,username,email

`,

[
username,
email,
hash
]

);



res.json(
result.rows[0]
);



}

catch(e){

res.status(500).json({

error:e.message

});

}


});







// ============================
// LOGIN
// ============================


app.post("/login",async(req,res)=>{


try{


const {
email,
password
}=req.body;




const result =
await pool.query(

"SELECT * FROM users WHERE email=$1",

[email]

);



if(!result.rows.length){

return res.json({

error:"User not found"

});

}



const user=result.rows[0];



const check =
await bcrypt.compare(

password,

user.password

);



if(!check){

return res.json({

error:"Wrong password"

});

}




const token =
jwt.sign(

{

id:user.id,

username:user.username

},

SECRET,

{

expiresIn:"7d"

}

);




res.json({

token,

user:{

id:user.id,

username:user.username,

email:user.email

}

});


}

catch(e){

res.status(500).json({

error:e.message

});

}


});








// ============================
// USERS LIST
// ============================


app.get("/users",async(req,res)=>{


try{


const result =
await pool.query(`

SELECT

id,

username,

created_at

FROM users

ORDER BY id DESC

`);




res.json(
result.rows
);



}

catch(e){


res.status(500).json({

error:e.message

});


}


});









// ============================
// SOCKET CHAT
// ============================



let onlineUsers=new Map();



io.on("connection",(socket)=>{


console.log(
"User connected"
);




// пользователь онлайн

socket.on(
"online",
(user)=>{


onlineUsers.set(

socket.id,

user

);



io.emit(

"onlineUsers",

Array.from(
onlineUsers.values()
)

);


});




// история сообщений


pool.query(`

SELECT *

FROM messages

ORDER BY id ASC

LIMIT 100

`)

.then(result=>{


socket.emit(

"history",

result.rows

);


});






// новое сообщение


socket.on(

"message",

async(data)=>{


try{


await pool.query(

`

INSERT INTO messages

(username,text)

VALUES($1,$2)

`,

[

data.username,

data.text

]

);




io.emit(

"message",

data

);



}

catch(e){

console.log(e);

}


});







socket.on(

"disconnect",

()=>{


onlineUsers.delete(

socket.id

);



io.emit(

"onlineUsers",

Array.from(

onlineUsers.values()

)

);



console.log(

"User disconnected"

);


});


});







// ============================
// START
// ============================


createTables()

.then(()=>{


server.listen(

10000,

()=>{


console.log(

"NovaChat server started on port 10000"

);


});


});
