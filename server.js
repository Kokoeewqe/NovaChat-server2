const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("NovaChat server is online 🚀");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {

  console.log("User connected");

  socket.on("message", (data) => {

    io.emit("message", data);

  });

  socket.on("disconnect", () => {

    console.log("User disconnected");

  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log("NovaChat server started on port " + PORT);

});
