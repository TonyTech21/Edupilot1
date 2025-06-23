const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Student = require('../models/Student');
const Session = require('../models/Session');
const { requireAuth, requireRole } = require('../middleware/auth');

// Result approval (for admin and officer)
router.get('/approve', requireAuth, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    
    const filter = { published: false };
    if (req.query.class) filter.className = req.query.class;
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.term) filter.term = req.query.term;
    if (req.query.session) filter.session = req.query.session;
    
    const results = await Result.find(filter)
      .sort({ enteredAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalResults = await Result.countDocuments(filter);
    const totalPages = Math.ceil(totalResults / limit);
    
    // Get unique values for filters
    const classes = await Result.distinct('className', { published: false });
    const subjects = await Result.distinct('subject', { published: false });
    const terms = await Result.distinct('term', { published: false });
    const sessions = await Result.distinct('session', { published: false });
    
    res.render('pages/result/approve', {
      title: 'Approve Results',
      results,
      classes,
      subjects,
      terms,
      sessions,
      currentPage: page,
      totalPages,
      query: req.query
    });
  } catch (error) {
    console.error('Error loading results for approval:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load results', error });
  }
});

// Approve single result
router.post('/approve/:id', requireAuth, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const user = req.session.user;
    const result = await Result.findById(req.params.id);
    
    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    
    result.published = true;
    result.publishedBy = user.email;
    result.publishedAt = new Date();
    
    await result.save();
    
    res.json({ success: true, message: 'Result approved successfully' });
  } catch (error) {
    console.error('Error approving result:', error);
    res.status(500).json({ success: false, message: 'Failed to approve result' });
  }
});

// Approve multiple results
router.post('/approve-multiple', requireAuth, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const user = req.session.user;
    const { resultIds } = req.body;
    
    if (!resultIds || resultIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No results selected' });
    }
    
    await Result.updateMany(
      { _id: { $in: resultIds } },
      { 
        published: true, 
        publishedBy: user.email, 
        publishedAt: new Date() 
      }
    );
    
    res.json({ success: true, message: `${resultIds.length} results approved successfully` });
  } catch (error) {
    console.error('Error approving multiple results:', error);
    res.status(500).json({ success: false, message: 'Failed to approve results' });
  }
});

// View published results
router.get('/published', requireAuth, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    
    const filter = { published: true };
    if (req.query.class) filter.className = req.query.class;
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.term) filter.term = req.query.term;
    if (req.query.session) filter.session = req.query.session;
    
    const results = await Result.find(filter)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalResults = await Result.countDocuments(filter);
    const totalPages = Math.ceil(totalResults / limit);
    
    // Get unique values for filters
    const classes = await Result.distinct('className', { published: true });
    const subjects = await Result.distinct('subject', { published: true });
    const terms = await Result.distinct('term', { published: true });
    const sessions = await Result.distinct('session', { published: true });
    
    res.render('pages/result/published', {
      title: 'Published Results',
      results,
      classes,
      subjects,
      terms,
      sessions,
      currentPage: page,
      totalPages,
      query: req.query
    });
  } catch (error) {
    console.error('Error loading published results:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load results', error });
  }
});

// Unpublish result (for admin only)
router.post('/unpublish/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    
    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    
    result.published = false;
    result.publishedBy = null;
    result.publishedAt = null;
    
    await result.save();
    
    res.json({ success: true, message: 'Result unpublished successfully' });
  } catch (error) {
    console.error('Error unpublishing result:', error);
    res.status(500).json({ success: false, message: 'Failed to unpublish result' });
  }
});

module.exports = router;