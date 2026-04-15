
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import admin from 'firebase-admin';
import { PassportStatic } from 'passport';
import { Buffer } from 'node:buffer';

import { env } from './env.js';
import { usersCollection, preapprovedUsersCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { DBUser } from '../types/index.js';

export const configurePassport = (passport: PassportStatic) => {
  passport.use(new GoogleStrategy({
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true
    },
    async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        // Find user by Google ID first
        let userSnap = await usersCollection.where('googleId', '==', profile.id).limit(1).get();
        if (!userSnap.empty) {
          const user = snapshotToData<DBUser>(userSnap.docs[0]);
          if (user) return done(null, user);
          return done(new Error("Failed to process user data from snapshot."), undefined);
        }
        
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("Google profile missing email."), undefined);
        
        // Find user by email to link accounts
        let emailUserSnap = await usersCollection.where('email', '==', email).limit(1).get();
        if (!emailUserSnap.empty) {
          const existingUserRef = emailUserSnap.docs[0].ref;
          await existingUserRef.update({ 
            googleId: profile.id, 
            profileImageUrl: profile.photos?.[0]?.value 
          });
          const updatedUserDoc = await existingUserRef.get();
          const user = snapshotToData<DBUser>(updatedUserDoc);
          if (user) return done(null, user);
          return done(new Error("Failed to process updated user data."), undefined);
        }

        // Check if this is a checkout flow based on state param
        let isCheckoutFlow = false;
        if (req.query.state) {
            try {
                const stateStr = Buffer.from(req.query.state as string, 'base64').toString();
                const state = JSON.parse(stateStr);
                if (state.planId) {
                    isCheckoutFlow = true;
                }
            } catch (e) {
                // Ignore parsing errors, assume not checkout flow
            }
        }

        // If not a checkout flow, enforce pre-approval
        if (!isCheckoutFlow) {
            const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
            if (preapprovedSnap.empty) {
                return done(null, false, { message: "Email not pre-approved." });
            }
        }

        // Create new user
        const newUserRef = usersCollection.doc();
        const newUserData: Omit<DBUser, 'createdAt' | 'passwordHash'> = {
          id: newUserRef.id,
          googleId: profile.id,
          name: profile.displayName,
          email: email,
          profileImageUrl: profile.photos?.[0]?.value,
          status: 'pending', // Always pending until payment is complete or admin approval
          hasSeenChatPrivacyNotice: false,
          registrationType: isCheckoutFlow ? 'payment' : 'standard'
        };
        await newUserRef.set({ 
          ...newUserData, 
          createdAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        const userDoc = await newUserRef.get();
        const user = snapshotToData<DBUser>(userDoc as admin.firestore.DocumentSnapshot);
        if (user) return done(null, user);
        return done(new Error("Failed to process newly created user data."), undefined);
      } catch (err) { 
        return done(err, undefined); 
      }
    }
  ));

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_CALLBACK_URL) {
    passport.use(new MicrosoftStrategy({
        clientID: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        callbackURL: env.MICROSOFT_CALLBACK_URL,
        scope: ['user.read'],
        tenant: 'common',
        authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      },
      async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any, info?: any) => void) => {
        try {
          // Find user by Microsoft ID first
          let userSnap = await usersCollection.where('microsoftId', '==', profile.id).limit(1).get();
          if (!userSnap.empty) {
            const user = snapshotToData<DBUser>(userSnap.docs[0]);
            if (user) return done(null, user);
            return done(new Error("Failed to process user data from snapshot."), undefined);
          }
          
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("Microsoft profile missing email."), undefined);
          
          // Find user by email to link accounts
          let emailUserSnap = await usersCollection.where('email', '==', email).limit(1).get();
          if (!emailUserSnap.empty) {
            const existingUserRef = emailUserSnap.docs[0].ref;
            await existingUserRef.update({ 
              microsoftId: profile.id, 
              profileImageUrl: profile.photos?.[0]?.value 
            });
            const updatedUserDoc = await existingUserRef.get();
            const user = snapshotToData<DBUser>(updatedUserDoc);
            if (user) return done(null, user);
            return done(new Error("Failed to process updated user data."), undefined);
          }

          const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
          if (preapprovedSnap.empty) {
              return done(null, false, { message: "Email not pre-approved." });
          }

          const newUserRef = usersCollection.doc();
          const newUserData: Omit<DBUser, 'createdAt' | 'passwordHash'> = {
            id: newUserRef.id,
            microsoftId: profile.id,
            name: profile.displayName,
            email: email,
            profileImageUrl: profile.photos?.[0]?.value,
            status: 'pending',
            hasSeenChatPrivacyNotice: false,
          };
          await newUserRef.set({ 
            ...newUserData, 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
          });
          const userDoc = await newUserRef.get();
          const user = snapshotToData<DBUser>(userDoc as admin.firestore.DocumentSnapshot);
          if (user) return done(null, user);
          return done(new Error("Failed to process newly created user data."), undefined);
        } catch (err) { 
          return done(err, undefined); 
        }
      }
    ));
  }
};
