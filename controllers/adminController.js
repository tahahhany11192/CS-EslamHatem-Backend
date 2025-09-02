const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin= require("../models/Admin");
const Course = require("../models/Course");
const Assignment = require("../models/Assignment");
const LiveSession = require("../models/LiveSession");
const PaymentRequest = require("../models/PaymentRequest");
const Lesson = require("../models/Lesson");
const Submission = require("../models/Submission");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");
const Assistant = require("../models/Assistant");
const multer = require('multer');
const path = require('path');
const SubscriptionCode = require("../models/SubscriptionCode");
const crypto = require("crypto"); 

// Configure storage for PDF files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/quizzes/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

// File filter for PDFs only
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});


/* ========================
   🔑 Admin Authentication
======================== */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", email);

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ message: "Not authorized" });

    console.log("Admin found:", admin.email);

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    console.log("Password matched");

    const token = jwt.sign(
      { userId: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log("JWT token generated");

    const { password: pwd, ...adminData } = admin.toObject();
    res.json({ token, admin: adminData });
  } catch (err) {
    console.error("❌ Admin login error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// ========================
// 👤 Get Admin Profile
// ========================
exports.getProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.userId).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json({ admin });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================
// ✏️ Update Profile
// ========================
exports.updateProfile = async (req, res) => {
  try {
    const { username, email } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : undefined;

    const updatedAdmin = await Admin.findByIdAndUpdate(
      req.user.userId,
      { $set: { username, email, ...(photo && { photo }) } },
      { new: true }
    ).select("-password");

    if (!updatedAdmin) return res.status(404).json({ message: "Admin not found" });
    res.json({ admin: updatedAdmin });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ========================
// 🔑 Change Password
// ========================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.user.userId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) return res.status(400).json({ message: "Incorrect password" });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================
   📚 Courses
======================== */
// controllers/adminController.js
exports.createCourse = async (req, res) => {
  try {
    const { title, description, type, price, duration } = req.body;

    // 1️⃣ Create new course
    const newCourse = new Course({
      title,
      description,
      type,
      price,
      duration,
      instructor: req.user.userId, // Admin who created
      thumbnail: req.file ? req.file.filename : null
    });

    await newCourse.save();

    // 2️⃣ Add course to the creating admin
    await Admin.findByIdAndUpdate(
      req.user.userId,
      { $push: { courses: newCourse._id } },
      { new: true }
    );

    // 3️⃣ Add course to ALL assistants
    await Assistant.updateMany(
      {},
      { $push: { assignedCourses: newCourse._id } }
    );

    res.status(201).json({ success: true, data: newCourse });
  } catch (err) {
    console.error("Error creating course:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, price, duration } = req.body;

    const updatedData = {
      title,
      description,
      duration,
      type,
      price, // 👈 update here
    };

    if (req.file) updatedData.thumbnail = req.file.filename;

    const updatedCourse = await Course.findByIdAndUpdate(id, updatedData, { new: true });

    res.json({ success: true, data: updatedCourse });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.deleteCourse = async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    res.json({ message: "Course deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.listCourses = async (req, res) => {
  try {
    const courses = await Course.find();
    res.json({ data: courses });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================
   📝 Assignments
======================== */
exports.createAssignment = async (req, res) => {
  try {
    const { title, description, courseId, dueDate } = req.body;

    // 1️⃣ Create new assignment
    const assignment = new Assignment({
      title,
      description,
      course: courseId,
      dueDate,
      pdf: req.file ? req.file.filename : null
    });

    await assignment.save();

    // 2️⃣ Push the assignment into the course.assignments array
    await Course.findByIdAndUpdate(courseId, {
      $push: { assignments: assignment._id }
    });

    res.json({ success: true, assignment });
  } catch (err) {
    console.error("Assignment create error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.updateAssignment = async (req, res) => {
  try {
    const { title, description, dueDate } = req.body;

    const update = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate }),
    };

    // if a new pdf uploaded, replace
    if (req.file) {
      update.pdf = req.file.filename;
    }

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).populate("course", "title");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json({ assignment });
  } catch (err) {
    console.error("Assignment update error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: "Assignment deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.listAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find().populate("course", "title");
    res.json({ data: assignments });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================
   📤 Submissions
======================== */
// controllers/adminController.js
exports.listSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate("student", "name email")
      .populate("assignment", "title")
      .select("fileUrl textAnswer grade feedback createdAt"); // ✅ include file & text

    res.json({ data: submissions });
  } catch (err) {
    console.error("List submissions error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.reviewSubmission = async (req, res) => {
  try {
    const { feedback, grade } = req.body;
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: "Not found" });

    if (feedback !== undefined) submission.feedback = feedback;
    if (grade !== undefined) submission.grade = grade;
    submission.reviewedAt = new Date();

    await submission.save();
    res.json({ submission });
  } catch (err) {
    console.error("Review error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.gradeAssignment = async (req, res) => {
  try {
    const { feedback, grade } = req.body;
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    if (feedback !== undefined) submission.feedback = feedback;
    if (grade !== undefined) submission.grade = grade;

    await submission.save();
    res.json({ message: "Assignment graded successfully", submission });
  } catch (err) {
    console.error("Grading error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



/* ========================
   🎥 Live Sessions
======================== */
// Create (Schedule) a live session
exports.scheduleLiveSession = async (req, res) => {
  try {
    const { title, courseId, scheduledAt, description, duration } = req.body;

    const session = new LiveSession({
      title,
      course: courseId,
      scheduledAt,
      description,
      duration,
    });

    await session.save();
    res.json({ session });
  } catch (err) {
    console.error("Schedule live session error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateLiveSession = async (req, res) => {
  try {
    const { title, scheduledAt, description, duration } = req.body;

    const session = await LiveSession.findByIdAndUpdate(
      req.params.id,
      { $set: { title, scheduledAt, description, duration } },
      { new: true }
    );

    res.json({ session });
  } catch (err) {
    console.error("Update live session error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.cancelLiveSession = async (req, res) => {
  try {
    await LiveSession.findByIdAndDelete(req.params.id);
    res.json({ message: "Live session canceled" });
  } catch (err) {
    console.error("Cancel live session error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const sessions = await LiveSession.find().populate("course", "title");
    res.json({ data: sessions });
  } catch (err) {
    console.error("List live sessions error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAvailableLiveSessions = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const admin = await Admin.findById(adminId).populate("courses", "title _id type");

    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const activeRooms = req.app.get("activeRooms") || {};
    const availableSessions = [];

    for (const [roomId, roomData] of Object.entries(activeRooms)) {
      const isEnrolled = admin.courses.some(
        course => course._id.toString() === roomData.courseId
      );

      if (isEnrolled) {
        const course = admin.courses.find(c => c._id.toString() === roomData.courseId);

        availableSessions.push({
          roomId,
          courseId: roomData.courseId,
          courseTitle: course?.title || "Unknown Course",
          instructorName: "Islam Hatem", // single-teacher site
          studentCount: Object.keys(roomData.students || {}).length,
          startedAt: roomData.createdAt
        });
      }
    }

    res.status(200).json({ data: availableSessions });
  } catch (err) {
    console.error("Error fetching live sessions:", err);
    res.status(500).json({ message: "Error fetching live sessions", error: err.message });
  } 
};

/* ========================
   👩‍🎓 Students
======================== */
exports.listStudents = async (req, res) => {
  try {
    const students = await User.find({ role: "student" })
      .populate("paidCourses", "title price")
      .select("-password");
    res.json({ data: students });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get single student profile
exports.getStudentById = async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: "student" })
      .populate("paidCourses", "title description price")
      .select("-password");

    if (!student) return res.status(404).json({ message: "Student not found" });

    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update student info
exports.updateStudent = async (req, res) => {
  try {
    const { name, email, phoneNumber, parentName, parentPhone, subscriptionCode } = req.body;

    const student = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { name, email, phoneNumber, parentName, parentPhone, subscriptionCode } },
      { new: true }
    ).select("-password");

    if (!student) return res.status(404).json({ message: "Student not found" });

    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Delete student
exports.deleteStudent = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Student deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Enroll student in course
exports.assignCourseToStudent = async (req, res) => {
  try {
    const { courseId } = req.body;
    const student = await User.findById(req.params.id);

    if (!student) return res.status(404).json({ message: "Student not found" });

    if (!student.paidCourses.includes(courseId)) {
      student.paidCourses.push(courseId);
      await student.save();
    }

    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Remove course from student
exports.removeCourseFromStudent = async (req, res) => {
  try {
    const { courseId } = req.body;
    const student = await User.findById(req.params.id);

    if (!student) return res.status(404).json({ message: "Student not found" });

    student.paidCourses = student.paidCourses.filter(c => c.toString() !== courseId);
    await student.save();

    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Toggle Compiler Access
exports.toggleCompilerAccess = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    student.hasCompilerAccess = !student.hasCompilerAccess;
    await student.save();

    res.json({ student });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ========================
   👥 Users & Assistants
======================== */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Create Assistant
exports.createAssistant = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    const assistant = new Assistant({
      name,
      email,
      password, // will be hashed by pre-save middleware
      phoneNumber
    });

    await assistant.save();
    res.json({ assistant });
  } catch (err) {
    console.error("Create Assistant Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ List Assistants
exports.listAssistants = async (req, res) => {
  try {
    const assistants = await Assistant.find().select("-password");
    res.json({ data: assistants });
  } catch (err) {
    console.error("List Assistants Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update Assistant
exports.updateAssistant = async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const assistant = await Assistant.findByIdAndUpdate(
      req.params.id,
      { $set: { name, email, phoneNumber } },
      { new: true }
    ).select("-password");

    if (!assistant) return res.status(404).json({ message: "Assistant not found" });
    res.json({ assistant });
  } catch (err) {
    console.error("Update Assistant Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Delete Assistant
exports.deleteAssistant = async (req, res) => {
  try {
    const deleted = await Assistant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Assistant not found" });
    res.json({ message: "Assistant deleted" });
  } catch (err) {
    console.error("Delete Assistant Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get Assistant Profile
exports.getAssistantProfile = async (req, res) => {
  try {
    const assistant = await Assistant.findById(req.params.id).select("-password");
    if (!assistant) return res.status(404).json({ message: "Assistant not found" });
    res.json({ assistant });
  } catch (err) {
    console.error("Get Assistant Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};




// ============================
// Create Lesson
// ============================
exports.createLesson = async (req, res) => {
  try {
    console.log("📥 Lesson create request body:", req.body);
    console.log("📂 Uploaded files:", req.files);

    if (req.files) {
      console.log("📁 Files structure:", {
        material: req.files.material ? req.files.material[0] : null,
        video: req.files.video ? req.files.video[0] : null,
        thumbnail: req.files.thumbnail ? req.files.thumbnail[0] : null,
      });
    }

    const lesson = new Lesson({
      title: req.body.title,
      description: req.body.description,
      type: req.body.type,
      price: req.body.price || 0,
      course: req.body.course, // 👈 the courseId
      material: req.files?.material ? req.files.material[0].filename : null,
      video: req.files?.video ? req.files.video[0].filename : null,
      thumbnail: req.files?.thumbnail ? req.files.thumbnail[0].filename : null,
    });

    await lesson.save();

    // ✅ Add lesson ID to Course.lessons
    await Course.findByIdAndUpdate(
      req.body.course,
      { $push: { lessons: lesson._id } },
      { new: true }
    );

    res.json({ success: true, lesson });
  } catch (err) {
    console.error("❌ Failed to create lesson:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ============================
// Update Lesson
// ============================
exports.updateLesson = async (req, res) => {
  try {
    const { title, description, type, price, course } = req.body;

    const updateFields = {
      title,
      description,
      type,
      price,
      course,
    };

    if (req.files?.material) updateFields.material = req.files.material[0].filename;
    if (req.files?.video) updateFields.video = req.files.video[0].filename;
    if (req.files?.thumbnail) updateFields.thumbnail = req.files.thumbnail[0].filename;

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );

    if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found" });

    res.json({ success: true, lesson });
  } catch (err) {
    console.error("❌ Lesson update error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================
// Delete Lesson
// ============================
exports.deleteLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found" });

    // ✅ Remove lesson from its course
    await Course.findByIdAndUpdate(
      lesson.course,
      { $pull: { lessons: lesson._id } }
    );

    res.json({ success: true, message: "Lesson deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ============================
// List Lessons
// ============================
exports.listLessons = async (req, res) => {
  try {
    const lessons = await Lesson.find().populate("course", "title");
    const lessonsWithFiles = lessons.map(lesson => ({
      ...lesson._doc,
      material: lesson.material ? `/uploads/${lesson.material}` : null,
      video: lesson.video ? `/uploads/${lesson.video}` : null,
      thumbnail: lesson.thumbnail ? `/uploads/${lesson.thumbnail}` : null,
    }));

    res.json({ success: true, data: lessonsWithFiles });
  } catch (err) {
    console.error("❌ Error listing lessons:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};




// Get single lesson
exports.getLessonById = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate("course");
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Upload lesson files
exports.uploadLessonFiles = async (req, res) => {
  try {
    const lessonId = req.params.id;
    const files = req.files;

    // Example: update your lesson in DB with file paths
    const updatedFields = {};
    if (files.material) updatedFields.material = "/uploads/" + files.material[0].filename;
    if (files.video) updatedFields.video = "/uploads/" + files.video[0].filename;
    if (files.thumbnail) updatedFields.thumbnail = "/uploads/" + files.thumbnail[0].filename;

    // Update lesson in DB
    const lesson = await Lesson.findByIdAndUpdate(lessonId, updatedFields, { new: true });

    // ✅ Return JSON so frontend can call res.json() safely
    return res.status(200).json({
      success: true,
      message: "Files uploaded successfully",
      lesson
    });
  } catch (err) {
    console.error("❌ uploadLessonFiles error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


// GET /api/admin/lessons?course=courseId
exports.getLessons = async (req, res) => {
  try {
    const filter = {};
    if (req.query.course) {
      filter.course = req.query.course;
    }

    const lessons = await Lesson.find(filter).populate("course");
    res.json({ success: true, data: lessons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


/* ========================
   ❓ Quizzes
======================== */
// Upload middleware
exports.uploadPDF = upload.single("pdfFile");

// ✅ Create Quiz
exports.createQuiz = async (req, res) => {
  try {
    let { title, description, courseId, questions, duration, examType } = req.body;

    if (typeof questions === "string") {
      questions = JSON.parse(questions);
    }

    if (examType === "pdf" && !req.file) {
      return res.status(400).json({ error: "PDF file is required for PDF exams" });
    }

    const quizData = {
      title,
      description,
      course: courseId,
      duration,
      examType: examType || "structured",
    };

    if (examType === "pdf" && req.file) {
      quizData.pdfFile = req.file.path;
    }

    const quiz = new Quiz(quizData);
    await quiz.save();

    // Structured exam → save questions
    if (examType === "structured" && questions?.length > 0) {
      const createdQuestions = await Promise.all(
        questions.map((q) =>
          Question.create({
            quiz: quiz._id,
            text: q.question,
            type: q.type || "mcq",
            options: q.options || [],
            correctAnswer: q.answer,
            marks: q.marks || 1,
          })
        )
      );
      quiz.questions = createdQuestions.map((q) => q._id);
      quiz.totalMarks = createdQuestions.reduce((sum, q) => sum + q.marks, 0);
      await quiz.save();
    }

    // Attach quiz to course
    await Course.findByIdAndUpdate(courseId, { $push: { Quiz: quiz._id } });

    res.json({ success: true, data: quiz });
  } catch (err) {
    console.error("Create quiz error:", err);
    res.status(500).json({ error: "Failed to create quiz" });
  }
};

// ✅ Grade Attempt
exports.gradeQuizAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    const attempt = await QuizAttempt.findById(id);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    attempt.score = score;
    attempt.feedback = feedback;
    attempt.reviewedAt = new Date();
    await attempt.save();

    res.json({ success: true, data: attempt });
  } catch (err) {
    console.error("Grade quiz attempt error:", err);
    res.status(500).json({ error: "Failed to grade attempt" });
  }
};

// ✅ List All Submissions
exports.listQuizSubmissions = async (req, res) => {
  try {
    let submissions = await QuizAttempt.find()
      .sort({ attemptedAt: -1 })
      .populate("student", "name email")
      .populate("quiz", "title description duration examType pdfFile")
      .populate("answers.question", "text correctAnswer marks"); // populate each answer's question

    res.json({ success: true, data: submissions });
  } catch (err) {
    console.error("List quiz submissions error:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
};


// New: get a single submission by id (fully populated) — add this helper endpoint
exports.getQuizSubmissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await QuizAttempt.findById(id)
      .populate("student", "name email")
      .populate("quiz", "title description duration examType pdfFile")
      .populate("answers.question", "text correctAnswer marks");

    if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });

    res.json({ success: true, data: submission });
  } catch (err) {
    console.error("Get quiz submission error:", err);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
};


// ✅ Manual Review Submission (per-question)
exports.reviewSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, score, feedback } = req.body; // answers for structured, score/feedback for PDF

    const attempt = await QuizAttempt.findById(id);
    if (!attempt) return res.status(404).json({ error: "Submission not found" });

    // Fetch the quiz to know its type
    const quiz = await Quiz.findById(attempt.quiz);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    if (quiz.examType === "pdf") {
      // PDF quiz → directly set score and feedback
      attempt.score = score ?? attempt.score;
      attempt.feedback = feedback ?? attempt.feedback;
      attempt.status = "reviewed";
      attempt.reviewedAt = new Date();
    } else {
      // Structured quiz → per-question grading
      let totalScore = 0;
      attempt.answers.forEach((ans) => {
        const update = answers.find((a) => a.questionId === ans.question.toString());
        if (update) {
          ans.isCorrect = update.isCorrect;
          ans.marksObtained = update.marksObtained;
        }
        totalScore += ans.marksObtained || 0;
      });
      attempt.score = totalScore;
      attempt.reviewedAt = new Date();
      attempt.status = "reviewed";
    }

    await attempt.save();
    res.json({ success: true, data: attempt });
  } catch (err) {
    console.error("Review submission error:", err);
    res.status(500).json({ error: "Failed to review submission" });
  }
};


// ✅ List All Quizzes
exports.listQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find()
      .populate("course", "title")
      .populate("questions");
    res.json({ success: true, data: quizzes });
  } catch (err) {
    console.error("List quizzes error:", err);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

// ✅ Delete Quiz
exports.deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Delete questions if structured
    await Question.deleteMany({ quiz: id });

    // Remove quiz from course
    await Course.findByIdAndUpdate(quiz.course, { $pull: { Quiz: quiz._id } });

    // Delete quiz itself
    await Quiz.findByIdAndDelete(id);

    res.json({ success: true, message: "Quiz deleted successfully" });
  } catch (err) {
    console.error("Delete quiz error:", err);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
};

// ✅ Update Quiz
exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, duration, questions, examType } = req.body;

    if (typeof questions === "string") {
      questions = JSON.parse(questions);
    }

    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    quiz.title = title || quiz.title;
    quiz.description = description || quiz.description;
    quiz.duration = duration || quiz.duration;
    quiz.examType = examType || quiz.examType;

    // Switch to PDF
    if (examType === "pdf" && req.file) {
      quiz.pdfFile = req.file.path;
      await Question.deleteMany({ quiz: id });
      quiz.questions = [];
      quiz.totalMarks = 0;
    }

    // Structured update
    if (examType === "structured" && questions?.length > 0) {
      await Question.deleteMany({ quiz: id });
      const newQuestions = await Promise.all(
        questions.map((q) =>
          Question.create({
            quiz: id,
            text: q.question,
            type: q.type || "mcq",
            options: q.options || [],
            correctAnswer: q.answer,
            marks: q.marks || 1,
          })
        )
      );
      quiz.questions = newQuestions.map((q) => q._id);
      quiz.totalMarks = newQuestions.reduce((sum, q) => sum + q.marks, 0);
    }

    await quiz.save();
    res.json({ success: true, data: quiz });
  } catch (err) {
    console.error("Update quiz error:", err);
    res.status(500).json({ error: "Failed to update quiz" });
  }
};

// ✅ Get Quiz PDF
exports.getQuizPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    if (quiz.examType !== "pdf" || !quiz.pdfFile) {
      return res.status(400).json({ error: "This quiz doesn't have a PDF file" });
    }
    res.download(quiz.pdfFile);
  } catch (err) {
    console.error("Get quiz PDF error:", err);
    res.status(500).json({ error: "Failed to download PDF" });
  }
};


function generateRandomCode(length = 10) {
  return crypto.randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

exports.generateSubscriptionCode = async (req, res) => {
  try {
    const { courseIds, numberOfCodes } = req.body;

    if (!courseIds || courseIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one course." });
    }

    const codes = [];
    for (let i = 0; i < (numberOfCodes || 1); i++) {
      const code = new SubscriptionCode({
        code: generateRandomCode(12),
        courses: courseIds,
        generatedBy: req.admin._id,
      });
      await code.save();
      codes.push(code);
    }

    res.status(201).json({
      success: true,
      message: "Subscription codes generated successfully.",
      codes,
    });
  } catch (err) {
    console.error("Error generating subscription code:", err);
    res.status(500).json({ message: "Server error." });
  }
};