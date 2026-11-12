# My Schedule — first starter build

An original Connecteam-inspired private roster PWA for iPhone and Android.

## Included
- English interface and responsive mobile layout
- Two authorised email addresses: c93300@gmail.com and quinlay.lu@gmail.com
- Roster-only fictional employees (no email/login required)
- Add, edit and delete shifts
- Week/month calendar, upcoming shifts, employee hours totals
- Installable PWA shell and basic local time-clock preview

## Important
This is a starter project, not yet a live app. The Firebase web app configuration has been added, but Authentication, Firestore and hosting still need to be configured. The sign-in screen will not work until Email/Password Authentication is enabled and both authorised accounts are created; local demo mode is not shared between devices. Chat is a placeholder and time-clock entries are device-local only.

## Setup required for real shared use
1. Create a Firebase project at https://console.firebase.google.com/
2. Add a Web App and paste its config into `app.js` (`firebaseConfig`).
3. In Firebase Authentication, enable Email/Password and create accounts for the two authorised email addresses. Each person sets their own password; never put passwords in this source code or send them in chat.
4. Create a Cloud Firestore database.
5. Publish the contents of `firestore.rules` in Firestore Rules.
6. Host the folder on an HTTPS static host (Firebase Hosting is one option).
7. Open the HTTPS address on both phones and sign in. iPhone: Safari → Share → Add to Home Screen. Android: Chrome → menu → Install app / Add to Home screen.

Both authorised users can edit the same workspace. Roster-only employees are Firestore records, not login accounts. Review and test security rules before entering real employee information.
