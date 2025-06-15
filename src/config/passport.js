const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch(error) {
    done(error, null);
  }
});

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      // Check if user exists with the same email
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Link Google account to existing user
        user.googleId = profile.id;
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          fullName: profile.displayName,
          emailVerified: true,
          profilePicture: {
            emoji: '👤',
            backgroundColor: '#808080'
          }
        });
      }
    }

    return done(null, user);
  } catch(error) {
    return done(error, null);
  }
}));

// Apple Strategy
passport.use(new AppleStrategy({
  clientID: process.env.APPLE_CLIENT_ID,
  teamID: process.env.APPLE_TEAM_ID,
  keyID: process.env.APPLE_KEY_ID,
  privateKey: process.env.APPLE_PRIVATE_KEY,
  callbackURL: '/api/auth/apple/callback',
  scope: ['name', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ appleId: profile.id });

    if (!user) {
      // Check if user exists with the same email
      user = await User.findOne({ email: profile.email });

      if (user) {
        // Link Apple account to existing user
        user.appleId = profile.id;
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          appleId: profile.id,
          email: profile.email,
          fullName: profile.name ? `${profile.name.firstName} ${profile.name.lastName}` : 'User',
          emailVerified: true,
          profilePicture: {
            emoji: '👤',
            backgroundColor: '#808080'
          }
        });
      }
    }

    return done(null, user);
  } catch(error) {
    return done(error, null);
  }
}));