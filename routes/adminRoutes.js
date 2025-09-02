const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const SubscriptionCode = require("../models/SubscriptionCode");
const authenticateAdmin = require("../middleware/authenticateAdmin");
const {
  createLesson, listLessons, updateLesson, deleteLesson,
  adminLogin,
  getProfile,
  updateProfile,
  changePassword,
  createCourse,
  updateCourse,
  deleteCourse,
  listCourses,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listAssignments,
  listSubmissions,
  scheduleLiveSession,
  updateLiveSession,
  cancelLiveSession,
  listSessions,
  listStudents,
  getAllUsers,
  deleteUser,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  listAssistants,
  getAssistantProfile,
    getLessonById, 
  uploadLessonFiles,
  createQuiz,
  listQuizzes,
  deleteQuiz,
  updateQuiz,
  listQuizSubmissions,
  reviewSubmission,
  getStudentById,
  updateStudent,
  deleteStudent,
  assignCourseToStudent,
  removeCourseFromStudent,
  toggleCompilerAccess,
    uploadPDF,
  getQuizPDF,
  gradeAssignment,
  gradeQuizAttempt,
  getQuizSubmissionById,
  getAvailableLiveSessions,
  generateSubscriptionCode
} = require("../controllers/adminController");

// Storage config
// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
// Add this to your multer configuration in adminRoutes.js
const fileFilter = (req, file, cb) => {
  // Allow videos, images, and documents
  if (
    file.mimetype.startsWith('video/') ||
    file.mimetype.startsWith('image/') ||
    file.mimetype === 'application/pdf' ||
    file.mimetype === 'application/msword' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

// Allow up to 10 GB files
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
  fileFilter
});

router.get("/students", authenticateAdmin, listStudents);
router.get("/students/:id", authenticateAdmin, getStudentById);
router.put("/students/:id", authenticateAdmin, updateStudent);
router.delete("/students/:id", authenticateAdmin, deleteStudent);

// Course assignment
router.post("/students/:id/courses", authenticateAdmin, assignCourseToStudent);
router.delete("/students/:id/courses", authenticateAdmin, removeCourseFromStudent);

// Compiler access
router.put("/students/:id/compiler", authenticateAdmin, toggleCompilerAccess);



/* 🔑 Auth */
router.post("/login", adminLogin);
router.get("/profile", authenticateAdmin, getProfile);
router.put("/profile", authenticateAdmin, upload.single("photo"), updateProfile);
router.put("/change-password", authenticateAdmin, changePassword);

/* 📚 Courses */
router.post("/courses", authenticateAdmin, upload.single("thumbnail"), createCourse);
router.get("/courses", authenticateAdmin, listCourses);
router.put("/courses/:id", authenticateAdmin, upload.single("thumbnail"), updateCourse);
router.delete("/courses/:id", authenticateAdmin, deleteCourse);

/* 📝 Assignments */
router.post("/assignments", authenticateAdmin, upload.single("pdf"), createAssignment);
router.get("/assignments", authenticateAdmin, listAssignments);
router.put("/assignments/:id", authenticateAdmin, upload.single("pdf"), updateAssignment);
router.delete("/assignments/:id", authenticateAdmin, deleteAssignment);
router.get("/assignments/submissions", authenticateAdmin, listSubmissions);
router.put("/assignments/submissions/:id/review", authenticateAdmin, reviewSubmission);
router.put("/assignments/submissions/:id/grade", authenticateAdmin, gradeAssignment);



/* 🎥 Live Sessions */
router.post("/livesessions", authenticateAdmin, scheduleLiveSession);
router.get("/livesessions", authenticateAdmin, listSessions);
router.put("/livesessions/:id", authenticateAdmin, updateLiveSession);
router.delete("/livesessions/:id", authenticateAdmin, cancelLiveSession);
router.get("/available-live-sessions", authenticateAdmin, getAvailableLiveSessions);

/* 👩‍🎓 Students */
router.get("/students", authenticateAdmin, listStudents);

/* 👥 Users & Assistants */
router.get("/users", authenticateAdmin, getAllUsers);
router.delete("/users/:id", authenticateAdmin, deleteUser);
router.post("/assistants", authenticateAdmin, createAssistant);
router.get("/assistants", authenticateAdmin, listAssistants);
router.put("/assistants/:id", authenticateAdmin, updateAssistant);
router.delete("/assistants/:id", authenticateAdmin, deleteAssistant);
router.get("/assistants/:id", authenticateAdmin, getAssistantProfile);

/* 📚 Lessons */
// In adminRoutes.js - ENHANCE the lesson route
router.post(
  "/lessons",
  authenticateAdmin,
  (req, res, next) => {
    upload.fields([
      { name: "material", maxCount: 1 },
      { name: "video", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ])(req, res, function (err) {
      if (err) {
        console.error("❌ Multer error:", err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ 
            success: false, 
            message: "File too large. Maximum size is 10GB" 
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      
      // Log successful uploads
      if (req.files) {
        console.log("✅ Files uploaded successfully:", {
          material: req.files.material ? req.files.material[0].originalname : "None",
          video: req.files.video ? req.files.video[0].originalname : "None",
          thumbnail: req.files.thumbnail ? req.files.thumbnail[0].originalname : "None",
        });
      }
      
      next();
    });
  },
  createLesson
);


router.get("/lessons", authenticateAdmin, listLessons);
router.put(
  "/lessons/:id",
  authenticateAdmin,
  upload.fields([
    { name: "material", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateLesson
);
router.delete("/lessons/:id", authenticateAdmin, deleteLesson);

router.get("/lessons/:id", authenticateAdmin, getLessonById);

// PUT upload lesson files
router.put(
  "/lessons/:id/files",
  authenticateAdmin,
  upload.fields([
    { name: "material", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),
  uploadLessonFiles
);


// Add PDF upload middleware to create and update routes
router.post("/quizzes", authenticateAdmin, uploadPDF, createQuiz);
router.get("/quizzes", authenticateAdmin, listQuizzes);
router.delete("/quizzes/:id", authenticateAdmin, deleteQuiz);
router.put("/quizzes/:id", authenticateAdmin, uploadPDF, updateQuiz);
router.get("/quiz-submissions", authenticateAdmin, listQuizSubmissions);
router.get("/quiz-submissions/:id", authenticateAdmin, getQuizSubmissionById);

router.put("/quiz-submissions/:id/review", authenticateAdmin, reviewSubmission);
router.put("/quizzes/attempts/:id/grade", authenticateAdmin, gradeQuizAttempt);
router.get("/quizzes/:id/pdf", authenticateAdmin, getQuizPDF); // New route to get PDF


router.post("/subscription-codes", authenticateAdmin, generateSubscriptionCode);

router.post("/packages", authenticateAdmin, async (req, res) => {
  try {
    const { name, courses } = req.body;
    const pkg = new Package({ name, courses });
    await pkg.save();
    res.json({ success: true, package: pkg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all packages
router.get("/packages", authenticateAdmin, async (req, res) => {
  try {
    const packages = await Package.find().populate("courses", "title");
    res.json({ success: true, data: packages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate subscription codes
router.post("/subscription-codes", authenticateAdmin, async (req, res) => {
  try {
    const { packageId, numberOfCodes } = req.body;

    const codes = [];
    for (let i = 0; i < numberOfCodes; i++) {
      const codeStr = crypto.randomBytes(4).toString("hex").toUpperCase();
      const code = new SubscriptionCode({
        code: codeStr,
        package: packageId
      });
      await code.save();
      codes.push(code);
    }

    res.json({ success: true, codes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
