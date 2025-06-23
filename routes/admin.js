const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Session = require('../models/Session');
const School = require('../models/School');
const Result = require('../models/Result');
const { requireAuth, requireRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// All admin routes require admin role
router.use(requireAuth);
router.use(requireRole('admin'));

// Manage Students
router.get('/students', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.class) filter.currentClass = req.query.class;
    if (req.query.session) filter.currentSession = req.query.session;
    if (req.query.search) {
      filter.$or = [
        { fullName: { $regex: req.query.search, $options: 'i' } },
        { studentID: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    const students = await Student.find(filter)
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit);
    
    const totalStudents = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalStudents / limit);
    
    const classes = await Class.find({ isActive: true }).sort({ className: 1 });
    const sessions = await Session.find().sort({ sessionName: -1 });
    
    res.render('pages/admin/students', {
      title: 'Manage Students',
      students,
      classes,
      sessions,
      currentPage: page,
      totalPages,
      query: req.query
    });
  } catch (error) {
    console.error('Error loading students:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load students', error });
  }
});

// Add Student Form
router.get('/students/add', async (req, res) => {
  try {
    const classes = await Class.find({ isActive: true }).sort({ className: 1 });
    const activeSession = await Session.getActiveSession();
    
    res.render('pages/admin/add-student', {
      title: 'Add New Student',
      classes,
      activeSession
    });
  } catch (error) {
    console.error('Error loading add student form:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load form', error });
  }
});

// Add Student POST
router.post('/students/add', upload.single('passport'), async (req, res) => {
  try {
    const {
      fullName, studentID, gender, dateOfBirth, parentPhone, 
      parentEmail, address, currentClass, section, password
    } = req.body;
    
    // Check if student ID already exists
    const existingStudent = await Student.findOne({ studentID });
    if (existingStudent) {
      return res.render('pages/admin/add-student', {
        title: 'Add New Student',
        error: 'Student ID already exists',
        classes: await Class.find({ isActive: true }).sort({ className: 1 }),
        activeSession: await Session.getActiveSession()
      });
    }
    
    const activeSession = await Session.getActiveSession();
    
    const studentData = {
      fullName,
      studentID,
      password: password || 'student123', // Default password if not provided
      gender,
      dateOfBirth: new Date(dateOfBirth),
      parentPhone,
      parentEmail,
      address,
      currentClass,
      section,
      currentSession: activeSession.sessionName,
      passportURL: req.file ? `/uploads/${req.file.filename}` : '/images/default-avatar.png'
    };
    
    await Student.create(studentData);
    
    res.redirect('/admin/students?success=Student added successfully');
  } catch (error) {
    console.error('Error adding student:', error);
    res.render('pages/admin/add-student', {
      title: 'Add New Student',
      error: 'Failed to add student',
      classes: await Class.find({ isActive: true }).sort({ className: 1 }),
      activeSession: await Session.getActiveSession()
    });
  }
});

// Edit Student
router.get('/students/edit/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    const classes = await Class.find({ isActive: true }).sort({ className: 1 });
    const sessions = await Session.find().sort({ sessionName: -1 });
    
    if (!student) {
      return res.redirect('/admin/students?error=Student not found');
    }
    
    res.render('pages/admin/edit-student', {
      title: 'Edit Student',
      student,
      classes,
      sessions
    });
  } catch (error) {
    console.error('Error loading student for edit:', error);
    res.redirect('/admin/students?error=Unable to load student');
  }
});

// Update Student
router.post('/students/edit/:id', upload.single('passport'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.passportURL = `/uploads/${req.file.filename}`;
    }
    
    // If password is provided, it will be hashed by the pre-save middleware
    if (!updateData.password) {
      delete updateData.password; // Don't update password if not provided
    }
    
    await Student.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin/students?success=Student updated successfully');
  } catch (error) {
    console.error('Error updating student:', error);
    res.redirect('/admin/students?error=Failed to update student');
  }
});

// Delete Student
router.post('/students/delete/:id', async (req, res) => {
  try {
    await Student.findByIdAndUpdate(req.params.id, { isActive: false });
    res.redirect('/admin/students?success=Student deactivated successfully');
  } catch (error) {
    console.error('Error deactivating student:', error);
    res.redirect('/admin/students?error=Failed to deactivate student');
  }
});

// Manage Staff
router.get('/staff', async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: ['teacher', 'officer'] } })
      .sort({ name: 1 });
    
    res.render('pages/admin/staff', {
      title: 'Manage Staff',
      staff
    });
  } catch (error) {
    console.error('Error loading staff:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load staff', error });
  }
});

// Add Staff Form
router.get('/staff/add', async (req, res) => {
  try {
    const classes = await Class.find({ isActive: true }).sort({ className: 1 });
    const subjects = await Class.getAllSubjects();
    
    res.render('pages/admin/add-staff', {
      title: 'Add New Staff',
      classes,
      subjects
    });
  } catch (error) {
    console.error('Error loading add staff form:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load form', error });
  }
});

// Add Staff POST
router.post('/staff/add', async (req, res) => {
  try {
    const { name, email, password, role, phone, address, assignedSubjects, assignedClasses } = req.body;
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('pages/admin/add-staff', {
        title: 'Add New Staff',
        error: 'Email already exists',
        classes: await Class.find({ isActive: true }).sort({ className: 1 }),
        subjects: await Class.getAllSubjects()
      });
    }
    
    const userData = {
      name,
      email,
      password,
      role,
      phone,
      address,
      assignedSubjects: Array.isArray(assignedSubjects) ? assignedSubjects : [assignedSubjects].filter(Boolean),
      assignedClasses: Array.isArray(assignedClasses) ? assignedClasses : [assignedClasses].filter(Boolean)
    };
    
    await User.create(userData);
    
    res.redirect('/admin/staff?success=Staff member added successfully');
  } catch (error) {
    console.error('Error adding staff:', error);
    res.render('pages/admin/add-staff', {
      title: 'Add New Staff',
      error: 'Failed to add staff member',
      classes: await Class.find({ isActive: true }).sort({ className: 1 }),
      subjects: await Class.getAllSubjects()
    });
  }
});

// Toggle Staff Status
router.post('/staff/toggle/:id', async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);
    if (staff) {
      staff.isActive = !staff.isActive;
      await staff.save();
      res.redirect('/admin/staff?success=Staff status updated successfully');
    } else {
      res.redirect('/admin/staff?error=Staff member not found');
    }
  } catch (error) {
    console.error('Error toggling staff status:', error);
    res.redirect('/admin/staff?error=Failed to update staff status');
  }
});

// Manage Classes
router.get('/classes', async (req, res) => {
  try {
    const classes = await Class.find().sort({ className: 1 });
    res.render('pages/admin/classes', {
      title: 'Manage Classes',
      classes
    });
  } catch (error) {
    console.error('Error loading classes:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load classes', error });
  }
});

// Add Class Form
router.get('/classes/add', (req, res) => {
  res.render('pages/admin/add-class', {
    title: 'Add New Class'
  });
});

// Add Class POST
router.post('/classes/add', async (req, res) => {
  try {
    const { className, level, classTeacher, sections, subjects, subjectCodes, isCore } = req.body;
    
    const classData = {
      className,
      level,
      classTeacher,
      sections: sections ? sections.split(',').map(s => ({ sectionName: s.trim() })) : [{ sectionName: 'A' }],
      assignedSubjects: []
    };
    
    // Process subjects
    if (subjects) {
      const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
      const codeArray = Array.isArray(subjectCodes) ? subjectCodes : [subjectCodes];
      const coreArray = Array.isArray(isCore) ? isCore : [isCore];
      
      subjectArray.forEach((subject, index) => {
        if (subject && subject.trim()) {
          classData.assignedSubjects.push({
            subjectName: subject.trim(),
            subjectCode: codeArray[index] || '',
            isCore: coreArray[index] === 'true'
          });
        }
      });
    }
    
    await Class.create(classData);
    
    res.redirect('/admin/classes?success=Class added successfully');
  } catch (error) {
    console.error('Error adding class:', error);
    res.render('pages/admin/add-class', {
      title: 'Add New Class',
      error: 'Failed to add class'
    });
  }
});

// Toggle Class Status
router.post('/classes/toggle/:id', async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    if (classDoc) {
      classDoc.isActive = !classDoc.isActive;
      await classDoc.save();
      res.redirect('/admin/classes?success=Class status updated successfully');
    } else {
      res.redirect('/admin/classes?error=Class not found');
    }
  } catch (error) {
    console.error('Error toggling class status:', error);
    res.redirect('/admin/classes?error=Failed to update class status');
  }
});

// Manage Sessions
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ sessionName: -1 });
    res.render('pages/admin/sessions', {
      title: 'Manage Sessions',
      sessions
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load sessions', error });
  }
});

// Add Session
router.post('/sessions/add', async (req, res) => {
  try {
    const { sessionName, startDate, endDate } = req.body;
    const sessionData = { sessionName };
    
    if (startDate) sessionData.startDate = new Date(startDate);
    if (endDate) sessionData.endDate = new Date(endDate);
    
    await Session.create(sessionData);
    res.redirect('/admin/sessions?success=Session added successfully');
  } catch (error) {
    console.error('Error adding session:', error);
    res.redirect('/admin/sessions?error=Failed to add session');
  }
});

// Edit Session
router.post('/sessions/edit/:id', async (req, res) => {
  try {
    const { sessionName, startDate, endDate } = req.body;
    const updateData = { sessionName };
    
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    
    await Session.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin/sessions?success=Session updated successfully');
  } catch (error) {
    console.error('Error updating session:', error);
    res.redirect('/admin/sessions?error=Failed to update session');
  }
});

// Set Active Session
router.post('/sessions/activate/:id', async (req, res) => {
  try {
    await Session.findByIdAndUpdate(req.params.id, { isActive: true });
    res.redirect('/admin/sessions?success=Session activated successfully');
  } catch (error) {
    console.error('Error activating session:', error);
    res.redirect('/admin/sessions?error=Failed to activate session');
  }
});

// Set Current Term
router.post('/sessions/set-term/:id', async (req, res) => {
  try {
    const { currentTerm } = req.body;
    await Session.findByIdAndUpdate(req.params.id, { currentTerm });
    res.redirect('/admin/sessions?success=Term updated successfully');
  } catch (error) {
    console.error('Error updating term:', error);
    res.redirect('/admin/sessions?error=Failed to update term');
  }
});

// Lock Term
router.post('/sessions/lock-term/:id', async (req, res) => {
  try {
    const { term } = req.body;
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    
    const lockField = term === 'First Term' ? 'firstTermLocked' : 
                     term === 'Second Term' ? 'secondTermLocked' : 'thirdTermLocked';
    
    session[lockField] = true;
    await session.save();
    
    res.json({ success: true, message: `${term} locked successfully` });
  } catch (error) {
    console.error('Error locking term:', error);
    res.status(500).json({ success: false, message: 'Failed to lock term' });
  }
});

// Student Promotion
router.get('/promote', async (req, res) => {
  try {
    const activeSession = await Session.getActiveSession();
    
    if (!activeSession || activeSession.currentTerm !== 'Third Term') {
      return res.render('pages/admin/promote', {
        title: 'Student Promotion',
        error: 'Student promotion is only available during Third Term',
        students: [],
        classes: [],
        activeSession
      });
    }
    
    const students = await Student.find({ isActive: true }).sort({ currentClass: 1, fullName: 1 });
    const classes = await Class.find({ isActive: true }).sort({ className: 1 });
    
    res.render('pages/admin/promote', {
      title: 'Student Promotion',
      students,
      classes,
      activeSession
    });
  } catch (error) {
    console.error('Error loading promotion page:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load promotion page', error });
  }
});

// Process Promotion
router.post('/promote', async (req, res) => {
  try {
    const { studentIds, newClass } = req.body;
    const activeSession = await Session.getActiveSession();
    
    const studentList = Array.isArray(studentIds) ? studentIds : [studentIds];
    
    for (const studentId of studentList) {
      const student = await Student.findById(studentId);
      if (student) {
        // Archive current session
        student.archivedSessions.push({
          sessionName: student.currentSession,
          className: student.currentClass,
          promoted: true,
          promotionDate: new Date()
        });
        
        // Update to new class
        student.currentClass = newClass;
        student.currentSession = activeSession.sessionName;
        
        await student.save();
      }
    }
    
    res.redirect('/admin/promote?success=Students promoted successfully');
  } catch (error) {
    console.error('Error promoting students:', error);
    res.redirect('/admin/promote?error=Failed to promote students');
  }
});

// School Profile
router.get('/school', async (req, res) => {
  try {
    const school = await School.findOne();
    res.render('pages/admin/school', {
      title: 'School Profile',
      school
    });
  } catch (error) {
    console.error('Error loading school profile:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load school profile', error });
  }
});

// Update School Profile
router.post('/school', upload.single('logo'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.logo = `/uploads/${req.file.filename}`;
    }
    
    await School.findOneAndUpdate({}, updateData, { upsert: true });
    res.redirect('/admin/school?success=School profile updated successfully');
  } catch (error) {
    console.error('Error updating school profile:', error);
    res.redirect('/admin/school?error=Failed to update school profile');
  }
});

module.exports = router;