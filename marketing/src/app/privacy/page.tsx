import type {Metadata} from 'next'
import {Link as MuiLink, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'


const TITLE = 'Privacy Policy'
const DESCRIPTION =
  'How Bldrs handles your data: minimal collection, in-browser processing, ' +
  'and no centralized model storage by default.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {canonical: '/privacy'},
  openGraph: {title: TITLE, description: DESCRIPTION, type: 'article'},
  twitter: {card: 'summary', title: TITLE, description: DESCRIPTION},
}


export default function PrivacyPage() {
  return (
    <PageShell title={TITLE}>
      <Typography variant="body2" sx={{opacity: 0.75}}>
        <strong>Effective Date:</strong> January 1, 2022
      </Typography>
      <Typography variant="body2" sx={{opacity: 0.75, mb: 3}}>
        <strong>Last Updated:</strong> November 2, 2026
      </Typography>

      <Typography variant="body1">
        Bldrs Share (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) provides
        open-source, browser-first tools for viewing and collaborating on 3D model
        files (e.g., IFC, STEP) using our Conway Engine. We design our software to
        minimize data collection and maximize user control.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>1. Information We Collect</Typography>
      <Typography variant="body1">
        Bldrs Share is built to operate <strong>without centralized data storage</strong>.
        We do not host user content or model data by default. Depending on your
        configuration:
      </Typography>
      <Typography variant="body1">
        <strong>Authentication data.</strong> When you sign in via Auth0/Google or
        another provider, we receive basic profile information (name, email, avatar)
        to create or identify your account.
      </Typography>
      <Typography variant="body1">
        <strong>Model data.</strong> Models you open are processed locally in your
        browser using WebAssembly. If you connect third-party storage (e.g.,
        Google Drive), we only request access to the specific files you select.
        We do not scan or store other files from your account.
      </Typography>
      {/* Keep this section in step with src/pages/Privacy.jsx, the in-app copy at
          /share/privacy. What it describes is in src/connections/README.md
          §"Reporting login failures". */}
      <Typography variant="body1">
        <strong>Error and reliability monitoring (always on).</strong> To run and
        secure the service, the hosted app reports errors and failures, including
        failed sign-ins, to Sentry, our error-monitoring provider. A report includes
        the error details, the page address, your browser and its version, the app
        release and page timing; for a failed sign-in, the Auth0 tracking id; and,
        if you are signed in, your account identifier (an opaque id, not your name
        or email). Reports never include your email, name, sign-in tokens or the
        contents of your files. Sentry processes this data on our behalf as our
        service provider. We use it only to find and fix problems and keep the
        service secure, never for advertising, and it is not shared for third-party
        purposes.
        {/* TODO(Pablo): state how long Sentry keeps reports. The retention period
            isn't recorded in this repo; take it from the Sentry plan rather than
            guessing. */}
      </Typography>
      <Typography variant="body1">
        <strong>Analytics (optional).</strong> On bldrs.ai we use Google Analytics,
        a third-party service, to understand how the product is used (e.g., page
        views, feature use). Your analytics choice applies to Google Analytics only;
        it does not turn off the error monitoring above. If you allow analytics,
        error reports may also carry your Google Analytics client id, so we can
        connect a problem to a visit; if you decline, they do not.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>2. Open-Source and Self-Hosted Use</Typography>
      <Typography variant="body1">
        Most of our codebase (including Bldrs Share and Conway) is available under
        the <strong>GNU Affero General Public License (AGPL)</strong> on GitHub. If
        you deploy or modify our software, you are responsible for complying with
        applicable privacy laws and for communicating your own deployment&apos;s
        data-handling practices to your users.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>3. How We Use Information</Typography>
      <Typography variant="body1">
        We use limited account and usage data to authenticate users; enable
        integrations (e.g., importing from Google Drive); improve performance,
        security, and usability; and communicate important service updates.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>4. Data Storage and Security</Typography>
      <Typography variant="body1">
        <strong>No persistent model storage by default.</strong> Model data is
        processed client-side and is not uploaded to our servers. Communication
        between your browser and our services uses HTTPS. Future, optional hosted
        collaboration features (e.g., Firestore for comments/sharing) may store
        limited user-generated data; if launched, this policy will be updated
        accordingly.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>5. Google User Data</Typography>
      <Typography variant="body1">
        Our use of Google user data complies with the{' '}
        <MuiLink href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </MuiLink>
        , including Limited Use requirements. Access to Google Drive is used solely
        to open or save the files that you explicitly select.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>6. Your Choices</Typography>
      <Typography variant="body1">
        You can disconnect Google access in your Google Account settings. You may
        request deletion of any stored account metadata or error reports tied to
        your account (if applicable) by emailing{' '}
        <MuiLink href="mailto:support@bldrs.ai">support@bldrs.ai</MuiLink>. You can
        also use open-source/self-hosted deployments without accounts, subject to
        your configuration.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>7. Children&apos;s Privacy</Typography>
      <Typography variant="body1">
        Our services are not directed to children under 13, and we do not knowingly
        collect personal information from them.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>8. Updates</Typography>
      <Typography variant="body1">
        We may update this Privacy Policy as our services evolve. The &ldquo;Last
        Updated&rdquo; date will reflect the most recent changes.
      </Typography>

      <Typography variant="h3" component="h2" sx={{mt: 4}}>9. Contact</Typography>
      <Typography variant="body1">
        Questions or privacy requests? Email{' '}
        <MuiLink href="mailto:support@bldrs.ai">support@bldrs.ai</MuiLink> or visit{' '}
        <MuiLink href="https://bldrs.ai" target="_blank" rel="noopener noreferrer">
          https://bldrs.ai
        </MuiLink>
        .
      </Typography>
    </PageShell>
  )
}
