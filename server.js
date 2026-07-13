const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();


const app = express();

const server = http.createServer(app);


app.use(cors());

app.use(express.json());


// отдаём сайт из папки public
app.use(express.static("public"));



const io = new Server(server, {

    cors:{
        origin:"*"
    }

});



// PostgreSQL Render

const pool = new Pool({

    connectionString:
    process.env.DATABASE_URL,

    ssl:{
        rejectUnauthorized:false
    }

});



const SECRET =
process.env.JWT_SECRET || "novachat-secret";





// создание таблиц

async function initDatabase(){


await pool.query(`

CREATE TABLE IF NOT EXISTS users (

id SERIAL PRIMARY KEY,

username TEXT NOT NULL,

email TEXT UNIQUE NOT NULL,

password TEXT NOT NULL,

created_at TIMESTAMP DEFAULT NOW()

);

`);




await pool.query(`

CREATE TABLE IF NOT EXISTS messages (

id SERIAL PRIMARY KEY,

user_id INTEGER,

username TEXT,

text TEXT,

created_at TIMESTAMP DEFAULT NOW()

);

`);



console.log("Database ready");


}






function createToken(user){


return jwt.sign(

{

id:user.id,

username:user.username,

email:user.email

},

SECRET,

{

expiresIn:"30d"

}

);


}






// REGISTER

app.post("/register", async(req,res)=>{


try{


const {

username,

email,

password

}=req.body;



const hash =
await bcrypt.hash(password,10);



const result =
await pool.query(

`

INSERT INTO users

(username,email,password)

VALUES($1,$2,$3)

RETURNING id,username,email,created_at

`,

[

username,

email,

hash

]

);



const user=result.rows[0];



res.json({

user,

token:createToken(user)

});



}

catch(error){


console.log(error);



res.status(400).json({

error:"Email уже используется"

});


}


});








// LOGIN


app.post("/login", async(req,res)=>{


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



if(result.rows.length===0){


return res.status(404).json({

error:"Пользователь не найден"

});


}



const user=result.rows[0];



const ok =
await bcrypt.compare(

password,

user.password

);



if(!ok){


return res.status(401).json({

error:"Неверный пароль"

});


}



res.json({

user,

token:createToken(user)

});



}

catch(error){


console.log(error);


res.status(500).json({

error:"Ошибка сервера"

});


}


});







// сообщения

app.get("/messages", async(req,res)=>{


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








// SOCKET CHAT


let onlineUsers=[];



io.on("connection",(socket)=>{


console.log("User connected");



socket.on("join",(user)=>{


socket.user=user;



onlineUsers.push({

id:user.id,

username:user.username,

socket:socket.id

});



io.emit(

"onlineUsers",

onlineUsers

);


});







socket.on("message",async(data)=>{


const result =
await pool.query(

`

INSERT INTO messages

(user_id,username,text)

VALUES($1,$2,$3)

RETURNING *

`,

[

data.user_id,

data.username,

data.text

]

);



io.emit(

"message",

result.rows[0]

);


});








socket.on("disconnect",()=>{


onlineUsers =
onlineUsers.filter(

u=>u.socket!==socket.id

);



io.emit(

"onlineUsers",

onlineUsers

);



console.log("User disconnected");


});


});








// запуск


initDatabase()

.then(()=>{


server.listen(

process.env.PORT || 10000,

()=>{


console.log(
"NovaChat server started"
);


}

);


});
