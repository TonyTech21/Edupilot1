const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  studentID: {
    type: String,
    required: true,
    trim: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  className: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  term: {
    type: String,
    required: true,
    enum: ['First Term', 'Second Term', 'Third Term']
  },
  session: {
    type: String,
    required: true,
    trim: true
  },
  // Assessment Scores
  ca1: {
    type: Number,
    required: true,
    min: 0,
    max: 20,
    default: 0
  },
  ca2: {
    type: Number,
    required: true,
    min: 0,
    max: 20,
    default: 0
  },
  exam: {
    type: Number,
    required: true,
    min: 0,
    max: 60,
    default: 0
  },
  // Calculated Fields
  total: {
    type: Number,
    default: 0
  },
  grade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    default: 'F'
  },
  remark: {
    type: String,
    enum: ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Fail'],
    default: 'Fail'
  },
  position: {
    type: Number,
    default: null
  },
  // Status Tracking
  published: {
    type: Boolean,
    default: false
  },
  publishedBy: {
    type: String,
    trim: true
  },
  publishedAt: {
    type: Date
  },
  enteredBy: {
    type: String,
    required: true,
    trim: true
  },
  enteredAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to calculate total, grade, and remark
resultSchema.pre('save', function(next) {
  // Calculate total
  this.total = this.ca1 + this.ca2 + this.exam;
  
  // Calculate grade based on total
  if (this.total >= 80) {
    this.grade = 'A';
    this.remark = 'Excellent';
  } else if (this.total >= 70) {
    this.grade = 'B';
    this.remark = 'Very Good';
  } else if (this.total >= 60) {
    this.grade = 'C';
    this.remark = 'Good';
  } else if (this.total >= 50) {
    this.grade = 'D';
    this.remark = 'Fair';
  } else if (this.total >= 40) {
    this.grade = 'E';
    this.remark = 'Poor';
  } else {
    this.grade = 'F';
    this.remark = 'Fail';
  }
  
  this.updatedAt = Date.now();
  next();
});

// Static method to calculate positions for a class
resultSchema.statics.calculatePositions = async function(className, term, session) {
  try {
    // Get all students in the class with their total scores
    const studentTotals = await this.aggregate([
      {
        $match: {
          className: className,
          term: term,
          session: session,
          published: true
        }
      },
      {
        $group: {
          _id: '$studentID',
          studentName: { $first: '$studentName' },
          totalScore: { $sum: '$total' },
          subjectCount: { $sum: 1 }
        }
      },
      {
        $addFields: {
          averageScore: { $divide: ['$totalScore', '$subjectCount'] }
        }
      },
      {
        $sort: { totalScore: -1, averageScore: -1 }
      }
    ]);

    // Assign positions
    for (let i = 0; i < studentTotals.length; i++) {
      const position = i + 1;
      await this.updateMany(
        {
          studentID: studentTotals[i]._id,
          className: className,
          term: term,
          session: session
        },
        { position: position }
      );
    }

    return studentTotals;
  } catch (error) {
    console.error('Error calculating positions:', error);
    throw error;
  }
};

// Compound indexes for efficient querying
resultSchema.index({ studentID: 1, term: 1, session: 1 });
resultSchema.index({ className: 1, subject: 1, term: 1, session: 1 });
resultSchema.index({ published: 1 });

module.exports = mongoose.model('Result', resultSchema);