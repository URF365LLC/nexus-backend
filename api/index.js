'use strict';
const router = require('express').Router();

router.use('/dashboard', require('./dashboard'));
router.use('/offers',    require('./offers'));
router.use('/scores',    require('./scores'));
router.use('/keywords',  require('./keywords'));
router.use('/reports',   require('./reports'));
router.use('/jobs',      require('./jobs'));
router.use('/sync',      require('./sync'));
router.use('/studio',    require('./studio'));

module.exports = router;
