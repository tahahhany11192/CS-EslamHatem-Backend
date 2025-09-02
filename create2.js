// Replace with your actual admin JWT
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGE5MTBmMWJhNWFjNWMwYjA1M2UyMzAiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NTYwNTg1NjgsImV4cCI6MTc1NjE0NDk2OH0.aReTiVWmJiAUez2MUt8MfI3BzoVEuy4TuSjKPvjuECk";

// Example quiz data
const quizData = {
  title: "Sample Quiz",
  courseId: "68ab6190834a3609ceb81712", // replace with a real course ID
  questions: [
    { question: "What is 2+2?", options: ["3", "4", "5"], answer: "4" },
    { question: "What is the capital of France?", options: ["Paris","London"], answer: "Paris" }
  ]
};

// POST request
fetch("http://localhost:3000/api/admin/quizzes", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  },
  body: JSON.stringify(quizData)
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));
