require('dotenv').config({ path: '.env' });
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const http = require('http');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const ChatRoom = require('./models/ChatRoom');
const searchRoutes = require("./routes/searchRoutes");

// Configuration
const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:54203';
const MONGO_URI = process.env.MONGO_URI || '*';

// Initialize Server
const app = express();
const server = http.createServer(app);

// Enhanced Socket.IO Configuration
const io = new Server(server, {
  cors: {
    origin: [FRONTEND_ORIGIN, 'http://127.0.0.1:54203'],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: [FRONTEND_ORIGIN, 'http://127.0.0.1:54203'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.url.startsWith('/uploads')
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use("/uploads", express.static(path.join(__dirname, "uploads", "admins")));

// Database Connection
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Enhanced Socket.IO Middleware
// Enhanced Socket.IO Middleware - FIXED VERSION
io.use(async (socket, next) => {
  try {
    // Development bypass
    if (process.env.NODE_ENV !== 'production') {
      if (socket.handshake.query.adminId) {
        // This is an admin - validate against Admin model
        try {
          const Admin = require('./models/Admin');
          const admin = await Admin.findById(socket.handshake.query.adminId);
          if (admin) {
            socket.admin = { 
              id: admin._id.toString(), 
              name: admin.username,
               
            };
            return next();
          }
        } catch (err) {
          console.log('Admin not found or invalid ID:', err.message);
        }
      }
      
      if (socket.handshake.query.studentId) {
        const studentId = socket.handshake.query.studentId;
        
        // Check if it's a valid MongoDB ObjectId
        if (/^[0-9a-fA-F]{24}$/.test(studentId)) {
          // This looks like a real user ID - try to find in User model
          try {
            const User = require('./models/User');
            const user = await User.findById(studentId);
            if (user) {
              socket.user = { 
                id: user._id.toString(), 
                name: user.name,
                
              };
              return next();
            }
          } catch (err) {
            console.log('User not found:', err.message);
          }
        }
        
        // If we get here, it's an anonymous student with a random ID
        socket.user = { 
          id: studentId, 
          name: `Student ${studentId.substring(0, 8)}`,
          role: 'anonymous' 
        };
        return next();
      }
    }

    // Production authentication - handle JWT tokens
    const token = socket.handshake.auth?.token ||
                  socket.handshake.query?.token ||
                  (socket.handshake.headers.authorization || '').replace('Bearer ','');
    
    if (!token) {
      // Allow anonymous connections for students
      const studentId = socket.handshake.query?.studentId || `anon_${socket.id}`;
      socket.user = { 
        id: studentId, 
        name: `Student ${studentId.substring(0, 8)}`,
        role: 'anonymous' 
      };
      return next();
    }
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        // Invalid token, allow as anonymous
        const studentId = socket.handshake.query?.studentId || `anon_${socket.id}`;
        socket.user = { 
          id: studentId, 
          name: `Student ${studentId.substring(0, 8)}`,
          role: 'anonymous' 
        };
        return next();
      }
      
      // Determine if this is an admin or user token
      if (decoded.adminId) {
        try {
          const Admin = require('./models/Admin');
          const admin = await Admin.findById(decoded.adminId);
          if (admin) {
            socket.admin = {
              id: admin._id.toString(),
              name: admin.username,
             
              ...decoded
            };
          }
        } catch (err) {
          console.log('Admin not found:', err.message);
        }
      } 
      else if (decoded.userId) {
        try {
          const User = require('./models/User');
          const user = await User.findById(decoded.userId);
          if (user) {
            socket.user = {
              id: user._id.toString(),
              name: user.name,
            
              ...decoded
            };
          }
        } catch (err) {
          console.log('User not found:', err.message);
        }
      }
      
      // If no user was found but we have a decoded token, use the token info
      if (!socket.user && decoded) {
        socket.admin = {
          id: decoded.admin || decoded.adminId || decoded.id || `admin_${socket.id}`,
          name: decoded.name || decoded.username || 'Admin',
          role: decoded.role || 'admin',
          ...decoded
        };
      }
      
      // If still no user, create anonymous user
      if (!socket.user) {
        const studentId = socket.handshake.query?.studentId || `anon_${socket.id}`;
        socket.user = { 
          id: studentId, 
          name: `Student ${studentId.substring(0, 8)}`,
          role: 'anonymous' 
        };
      }
      
      next();
    });
  } catch (err) {
    console.error('Socket auth error:', err);
    // Allow connection as anonymous user on error
    const studentId = socket.handshake.query?.studentId || `anon_${socket.id}`;
    socket.user = { 
      id: studentId, 
      name: `Student ${studentId.substring(0, 8)}`,
      role: 'anonymous' 
    };
    next();
  }
});

// Room Management
const activeRooms = {};
app.set("activeRooms", activeRooms);
app.set("io", io);

const User = require("./models/User");
const Course = require("./models/Course");
const Admin = require('./models/Admin');

io.on("connection", (socket) => {
  console.log(`⚡ ${socket.user?.role} connected [${socket.id}] via ${socket.conn.transport.name}`);

  // ========== Live Classroom Functionality ==========
  // admin creates room
  socket.on("create-room", async (data, callback) => {
    try {
      const { roomId, courseId } = data;
      const adminId = socket.user?.id;

      if (!roomId || !courseId || !adminId) {
        throw new Error("Missing required fields");
      }

      if (activeRooms[roomId]) {
        throw new Error("Room already exists");
      }

      // 🔑 Fetch course title and admin name
      const course = await Course.findById(courseId).select("title");
      const admin = await Admin.findById(adminId).select("username");

      if (!course || !admin) throw new Error("Invalid course or admin");

      activeRooms[roomId] = {
        courseId,
        courseTitle: course.title,
        adminId,
        adminName: admin.username,
        adminSocket: socket.id,
        students: {},
        createdAt: new Date(),
        status: "active",
      };

      socket.join(roomId);

      console.log(`🏫 Room created: ${roomId} for "${course.title}" by admin ${admin.username}`);

      callback?.({ status: "success", roomId, courseTitle: course.title, adminName: admin.username });
      socket.emit("room-created", { roomId, courseTitle: course.title, adminName: admin.username });
    } catch (err) {
      console.error("Room creation error:", err);
      callback?.({ error: err.message });
    }
  });

  // Student joins room
// Student joins room - UPDATED VERSION
socket.on("join-room", async (data, callback) => {
  try {
    const { roomId } = data;
    const studentId = socket.user?.id;
    const studentRole = socket.user?.role;

    if (!activeRooms[roomId]) {
      return callback?.({ error: "Room does not exist or has ended" });
    }

    if (activeRooms[roomId].students[studentId]) {
      return callback?.({ error: "You are already in this room" });
    }

    let studentName = socket.user?.name || `Student ${studentId.substring(0, 8)}`;
    
    // For anonymous users, we don't need to query the database
    if (studentRole === 'student' && /^[0-9a-fA-F]{24}$/.test(studentId)) {
      // Only query database for valid MongoDB ObjectIds
      try {
        const student = await User.findById(studentId).select("name");
        if (student) {
          studentName = student.name || studentName;
        }
      } catch (dbErr) {
        console.log("Student not found in database, using provided name");
      }
    }

    socket.join(roomId);

    // Save student with name
    activeRooms[roomId].students[studentId] = { 
      socketId: socket.id, 
      name: studentName,
    };

    io.to(roomId).emit("user-joined", { id: studentId, name: studentName });
    console.log(`🎓 ${studentName} joined room ${roomId}`);

    callback?.({ status: "success", roomId, studentName });
  } catch (err) {
    console.error("Join room error:", err);
    callback?.({ error: err.message });
  }
});

  // WebRTC Signaling (unchanged except names if needed)
  socket.on("webrtc-offer", (data) => {
    try {
      const { roomId, studentId, sdp } = data;
      const room = activeRooms[roomId];

      if (!room || !room.students[studentId]) {
        throw new Error("Invalid room or student");
      }

      io.to(room.students[studentId].socketId).emit("webrtc-offer", {
        from: socket.id,
        sdp,
        roomId,
      });
    } catch (e) {
      console.error("webrtc-offer error", e);
    }
  });

  socket.on("webrtc-answer", (data) => {
    try {
      const { roomId, sdp } = data;
      const room = activeRooms[roomId];
      if (!room) throw new Error("Room not found");

      io.to(room.adminSocket).emit("webrtc-answer", {
        from: socket.id,
        sdp,
        roomId,
        student: { id: socket.user?.id, name: socket.user?.name }, // send both
      });
    } catch (e) {
      console.error("webrtc-answer error", e);
    }
  });

  // ICE candidates
  socket.on("ice-candidate", (data) => {
    try {
      const { roomId, candidate, studentId } = data;
      const room = activeRooms[roomId];
      if (!room) throw new Error("Room not found");

      let targetSocket;
      if (studentId) {
        targetSocket = room.students[studentId]?.socketId;
      } else {
        targetSocket = room.adminSocket;
      }

      if (targetSocket) {
        io.to(targetSocket).emit("ice-candidate", {
          from: socket.id,
          candidate,
          roomId,
          studentId: studentId || socket.user?.id,
        });
      }
    } catch (e) {
      console.error("ice-candidate error", e);
    }
  });

  // Chat messages
  socket.on("send-message", (roomId, message) => {
    if (activeRooms[roomId]) {
      const senderName = socket.user?.name || "Anonymous";
      io.to(roomId).emit("new-message", { sender: senderName, message });
    }
  });

  // admin controls
  socket.on("admin-mute-student", ({ roomId, targetId, mute }) => {
    const room = activeRooms[roomId];
    if (!room || room.adminSocket !== socket.id) return;

    const studentSocket = room.students[targetId]?.socketId;
    if (!studentSocket) return;

    io.to(studentSocket).emit(mute ? "force-mute" : "force-unmute");
    console.log(`admin ${room.adminName} ${mute ? "muted" : "unmuted"} student ${room.students[targetId]?.name}`);
  });

  socket.on("admin-kick-student", ({ roomId, targetId }) => {
    const room = activeRooms[roomId];
    if (!room || room.adminSocket !== socket.id) return;

    const studentSocket = room.students[targetId]?.socketId;
    if (!studentSocket) return;

    io.to(studentSocket).emit("force-kick");

    const studentName = room.students[targetId]?.name;
    delete room.students[targetId];

    io.to(roomId).emit("user-left", { id: targetId, name: studentName });
    console.log(`admin ${room.adminName} kicked student ${studentName}`);
  });

  // Leave room
  socket.on("leave-room", (roomId) => {
    if (!activeRooms[roomId]) return;

    if (socket.user?.role === "admin" && activeRooms[roomId]?.adminSocket === socket.id) {
      io.to(roomId).emit("room-ended");
      delete activeRooms[roomId];
      console.log(`🚪 Room ${roomId} ended by admin`);
    } else {
      const studentId = socket.user?.id;
      if (studentId && activeRooms[roomId]?.students[studentId]) {
        const studentName = activeRooms[roomId].students[studentId]?.name;
        delete activeRooms[roomId].students[studentId];
        io.to(roomId).emit("user-left", { id: studentId, name: studentName });
        console.log(`🎓 Student ${studentName} left room ${roomId}`);
      }
    }
  });

  // (keep emoji, raise-hand, lower-hand, task events same but swap ids → names if needed)

  // Disconnect handler
  socket.on("disconnect", () => {
    console.log(`⚠️ ${socket.user?.role} disconnected [${socket.id}]`);

    for (const roomId in activeRooms) {
      const room = activeRooms[roomId];

      if (room.adminSocket === socket.id) {
        io.to(roomId).emit("room-ended");
        delete activeRooms[roomId];
        console.log(`🚪 Room ${roomId} ended (admin ${room.adminName} disconnected)`);
        continue;
      }

      for (const studentId in room.students) {
        if (room.students[studentId].socketId === socket.id) {
          const studentName = room.students[studentId].name;
          delete room.students[studentId];
          io.to(roomId).emit("user-left", { id: studentId, name: studentName });
          console.log(`🎓 Student ${studentName} disconnected from ${roomId}`);
          break;
        }
      }

      if (Object.keys(room.students).length === 0 && room.adminSocket !== socket.id) {
        delete activeRooms[roomId];
        console.log(`🧹 Cleaned up empty room ${roomId}`);
      }
    }
  });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes')); // Islam Hatem only
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/lessons', require('./routes/lessonRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/live', require('./routes/liveRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/help', require('./routes/helpRoutes'));
app.use('/api/assistant', require("./routes/assistantRoutes"));
app.use('/api/courses', require("./routes/courseRoutes"));
app.use('/api/lessons', require("./routes/lessonRoutes"));
app.use('/api/assignments', require("./routes/assignmentRoutes"));
app.use('/api/payment-requests', require('./routes/paymentRequestRoutes'));

app.use('/api/live', require("./routes/liveRoutes"));
app.use('/api/chat', require("./routes/chatRoutes"));
app.use('/api/help', require("./routes/helpRoutes"));
app.use('/api/quizzes', require("./routes/quizRoutes"));


// Active rooms endpoint
app.get('/api/active-rooms', (req, res) => {
  res.json({
    status: 'success',
    data: Object.keys(activeRooms).map(roomId => ({
      roomId,
      courseId: activeRooms[roomId].courseId,
      adminId: activeRooms[roomId].adminId,
      studentCount: Object.keys(activeRooms[roomId].students).length,
      createdAt: activeRooms[roomId].createdAt
    }))
  });
});

// Chat rooms endpoint
app.get('/api/chat-rooms', async (req, res) => {
  try {
    const rooms = await ChatRoom.find().populate('participants');
    res.json({ status: 'success', data: rooms });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Backend is working 🎉');
});

// PeerJS Server with enhanced configuration
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  proxied: true,
  alive_timeout: 60000,
  concurrent_limit: 5000,
  allow_discovery: true
});

app.use('/peerjs', peerServer);

// WebRTC status endpoint
app.get('/api/webrtc-status', (req, res) => {
  res.json({
    status: 'active',
    activeRooms: Object.keys(activeRooms).length,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File too large. Maximum size is 100MB' 
      });
    }
  }
  
  res.status(500).json({ 
    status: 'error',
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`
    🚀 Server running on http://localhost:${PORT}
    📡 Socket.IO: ws://localhost:${PORT}/socket.io/
    🎮 PeerJS: http://localhost:${PORT}/peerjs
    💬 Chat: ws://localhost:${PORT}
    🌐 CORS Origin: ${FRONTEND_ORIGIN}
    🏫 Active rooms: ${Object.keys(activeRooms).length}
  `);
});

// Cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('🔴 MongoDB connection closed');
      process.exit(0);
    });
  });
});




