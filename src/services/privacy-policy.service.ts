import { prisma } from '../utils/prisma.js';

const SETTING_KEY = 'privacy_policy';

const DEFAULT_PRIVACY_POLICY = JSON.stringify({
  title: 'Privacy Policy for Kathir Academy (PrepNest)',
  effectiveDate: 'September 14, 2026',
  lastUpdated: 'September 14, 2026',
  content: `### 1. Information We Collect
We collect information directly from you, automatically when you use our platform, and through third-party services integrated into our application.

#### A. Personal Information You Provide
- **Account Registration Data:** Full name, email address, and account password (stored strictly as an encrypted bcrypt hash).
- **Verification Data:** One-Time Passwords (OTPs) sent to your email for email verification and password resets.
- **Profile Details:** Profile display name or avatar images uploaded voluntarily.
- **User Generated Content (UGC):** Comments, questions, and replies posted within our topic discussion forums.

#### B. Educational & Performance Data
- **Test Performance:** Answers submitted in mock tests, daily challenges, time taken per question, test scores, accuracy percentages, percentile rank, and completion status.
- **Learning Activity:** Study materials viewed, PDF notes accessed, video views, and daily login streak records.

#### C. Automatically Collected Technical Data
- **Device & Connection Data:** IP address, browser type, operating system, timestamped access logs, and referral URLs.
- **Local Storage Data:** We store temporary authentication tokens (\`prepnest_token\`), basic user identity cache (\`prepnest_user\`), and your local download history list (\`prepnest_downloads_history\`) in your web browser's localStorage.

---

### 2. How We Use Your Information
We process your personal information strictly for legitimate educational, operational, and safety purposes:
- **Service Provision:** Creating and managing user accounts, authenticating logins, and processing password resets.
- **Performance Analytics:** Calculating score breakdowns, subject accuracy metrics, and percentile rankings.
- **Content Access:** Delivering syllabus modules, notes, mock tests, and video lectures.
- **Notifications:** Sending essential account security alerts, test updates, and announcement notifications.
- **Platform Improvement:** Analyzing aggregated usage patterns to fix bugs, optimize database queries, and improve UI UX.

---

### 3. Data Protection & Security Measures
We prioritize the security of your personal data and employ robust technical safeguards:
- **Password Protection:** All account passwords are encrypted using industry-standard bcrypt hashing with salt rounds prior to storage.
- **Token Security:** Authentication uses signed JSON Web Tokens (JWT) transmitted over HTTPS.
- **Database Access:** Databases are protected behind network firewalls with strictly controlled access credentials.
- **No Selling of Personal Data:** We **do not sell, rent, or trade** your personal information or test history to any third-party advertisers or data brokers.

---

### 4. Third-Party Integrations
Kathir Academy integrates trusted third-party services to power specific application features:
- **Transactional Emails (Brevo):** Email verification OTPs and password reset links are dispatched via Brevo transactional email APIs.
- **Cloud Media Storage (Cloudinary):** Profile avatars and note attachments are securely stored on Cloudinary.
- **Video Hosting:** Embedded video lectures are hosted via YouTube. Watching embedded videos is subject to YouTube's standard Terms of Service and Privacy Policy.

---

### 5. Your Data Rights & Control
As a user of Kathir Academy, you have full control over your personal data:
- **Access & Profile Updates:** You can view and update your name and profile details anytime via account settings.
- **Local Storage Management:** You can clear browser storage at any time to remove cached offline download records.
- **Account Deletion / Data Erase Requests:** You may request complete deletion of your account and associated performance records by contacting support.

---

### 6. Children's Privacy
Our services are designed for students preparing for competitive and academic examinations. We do not knowingly collect personal information from individuals under the age of 13 without parental/institutional consent.

---

### 7. Changes to This Privacy Policy
We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or platform features. When updates are made, we will revise the "Last Updated" date at the top of this policy. We encourage you to review this Privacy Policy periodically.

---

### 8. Contact Us
If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us at:
- **Email:** support@prepnest.com / privacy@kathiracademy.in
- **Platform:** Kathir Academy (PrepNest Platform)
`
});

export const privacyPolicyService = {
  async getPrivacyPolicy() {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!setting) {
      return {
        key: SETTING_KEY,
        value: DEFAULT_PRIVACY_POLICY,
        updatedAt: new Date().toISOString(),
      };
    }

    return setting;
  },

  async updatePrivacyPolicy(data: { title?: string; effectiveDate?: string; lastUpdated?: string; content: string }) {
    const payload = JSON.stringify({
      title: data.title || 'Privacy Policy for Kathir Academy (PrepNest)',
      effectiveDate: data.effectiveDate || 'September 14, 2026',
      lastUpdated: data.lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      content: data.content,
    });

    const setting = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: payload },
      create: { key: SETTING_KEY, value: payload },
    });

    return setting;
  },

  async resetToDefault() {
    const setting = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: DEFAULT_PRIVACY_POLICY },
      create: { key: SETTING_KEY, value: DEFAULT_PRIVACY_POLICY },
    });

    return setting;
  }
};
