import type {Metadata} from 'next'
import {Box, Link as MuiLink, Typography} from '@mui/material'
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
      {/* A blank line's worth between paragraphs; headings keep their own
          spacing. Same rule as the app copy (src/pages/Privacy.jsx). */}
      <Box sx={{'& p.MuiTypography-body1': {mb: 2}}}>
        <Typography variant="body2" sx={{opacity: 0.75}}>
          <strong>Effective Date:</strong> January 1, 2022
        </Typography>
        <Typography variant="body2" sx={{opacity: 0.75, mb: 3}}>
          <strong>Last Updated:</strong> November 25, 2026
        </Typography>

        <Typography variant="body1">
          Bldrs Share (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) provides
          open-source, browser-first tools for viewing and collaborating on 3D model
          files (e.g., IFC, STEP) using our Conway Engine. We design our software to
          minimize data collection and maximize user control.
        </Typography>

        <Typography variant="h3" component="h2" sx={{mt: 4}}>1. Information We Collect</Typography>
        <Typography variant="body1">
          Bldrs Share operates <strong>without centralized model data storage</strong>. We
          do not upload or host user model data by default. What we do receive:
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
        {/* Keep these paragraphs word for word in step with
           src/pages/Privacy.jsx, the SPA's copy at /privacy (BaseRoutes.jsx; Privacy.test.jsx checks).
           What they describe: design/new/analytics-consent.md. */}
        <Typography variant="body1">
          <strong>Error and reliability reports.</strong> When something fails, the app
          reports what failed, the app and browser versions and the address of the page
          you were on to our error-monitoring service (Sentry). For a model opened from
          GitHub, Google Drive or a web address, that page address includes where the
          model is. Reports from our servers also carry your account ID when you’re signed
          in. Separately, the app counts browsers that can’t run part of it (for example,
          with no WebGL) by browser family and device type only, sent to Google Analytics
          from our server under one shared ID rather than yours. None of these reports set
          cookies, carry an identifier that follows your browser between visits, or
          include your models’ contents. Sentry keeps them for at most 90 days. They are
          part of operating the service and are always on, on the basis of our legitimate
          interest in keeping Bldrs Share secure and working.
        </Typography>
        <Typography variant="body1">
          <strong>How models load.</strong> There is no Google Analytics or other tracking
          code in the app: no analytics cookies, and no identifier that follows your
          browser between visits. To learn how Bldrs Share is used and how it performs,
          the app reports each model you open to our server: the kind of file, its size
          range, where it came from (your computer, GitHub, Google Drive or a web
          address), whether it was the first model on the page, how long it took to load,
          how complex it was, roughly how many errors and warnings it raised, whether it
          loaded or failed and at what stage, and whether you’re on a phone or a computer.
          A report never includes a model’s name, path, web address or contents; the only
          model it names is one of our own sample models, if that’s what you opened. It
          carries one random ID that lives only while the page is open, so the models
          opened in one visit can be counted together; it is never stored, and a reload
          starts a new one. The app also reports each time you open a page: what kind of
          page it was (the home page, or the viewer and where its model comes from), what
          kind of site you came from (a search engine, a social network, our own site,
          another site, or none), a campaign name only if it is one we know, and whether
          you’re on a phone or a computer. It never includes the page’s address or the
          site you came from, and it carries the same random ID, so a visit can be counted
          with the models opened in it. Our server adds your country, as its hosting
          provider locates the request, and keeps it nowhere. Our server passes these
          reports on to Google Analytics under
          one shared ID, so Google never sees your browser or network address. They are
          always on, on the basis of our legitimate interest in running and improving the
          service.
        </Typography>
        <Typography variant="body1">
          <strong>Your account’s usage.</strong> If you’re signed in, the report of each
          model you open is also kept with your account, so we can see how much each
          account uses Bldrs Share and how it performs for them: the same kind of file,
          size range, where it came from, whether it loaded and how long it took, with how
          complex it was rounded and your plan. Like every report, it never includes a
          model’s name, path, web address or contents. We use it to run and improve the
          service, on the basis of our legitimate interest in doing so. Your account’s
          records are kept for 13 months, then reduced to totals that name no account. To
          turn this off, use “Use my usage to improve Bldrs” in the Profile menu; turning
          it off also deletes the records already kept. Records of when your account
          reaches a free-use limit are kept either way, for the same 13 months, because
          they are part of applying the limits. Sign-ins and upgrade clicks are counted in
          Google Analytics from our server under one shared ID, never yours.
        </Typography>
        <Typography variant="body1">
          <strong>Free-use limits.</strong> Some features have a free allowance. If you’re
          signed in, your account keeps a record of the private models you’ve opened
          (which model, and when) for as long as the current limit window needs it, to
          apply your plan’s limits; if you subscribe, it also lists the models you’ve
          exported so you can find them again. If you use the AI assistant without signing
          in, your browser keeps a random ID our server issued, which expires after 24
          hours, and our server keeps a keyed hash of your network address for the day,
          never the address itself. Both are used only to apply the free allowance and to
          stop abuse.
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
          request deletion of any stored account metadata (if applicable) by emailing{' '}
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
      </Box>
    </PageShell>
  )
}
