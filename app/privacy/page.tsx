import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Icons'
import { SUPPORT_EMAIL } from '@/lib/support'

// Public Privacy Policy. Plain English legal text (not translated), a static
// page with the site's own colours and type. Update LAST_UPDATED whenever the
// policy text changes.
const LAST_UPDATED = '24 October 2026'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Tarafab.XAi collects, uses, shares and protects your personal information, and the choices available to you.',
  alternates: { canonical: '/privacy' },
}

const Mail = () => <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:text-accent-hover underline underline-offset-4 break-all">{SUPPORT_EMAIL}</a>

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: 'information-we-collect', title: '1. Information We Collect', body: <>
      <p>Depending on the services and features you use, we may collect the following information:</p>
      <dl>
        <dt>Account information</dt><dd>Your full name, email address, phone number, and other details you provide when registering or managing your account.</dd>
        <dt>Phone number</dt><dd>We collect your phone number to contact you about your account when necessary. Under the current registration flow, your phone number is not used to sign in, and we do not send SMS verification codes to it.</dd>
        <dt>Account and transaction information</dt><dd>Information associated with your account activity, deposits, withdrawals, wallet activity, transactions, and use of the platform’s financial features.</dd>
        <dt>Verification information</dt><dd>If you use features that require identity or eligibility checks, we may collect the information and documents you submit for those purposes.</dd>
        <dt>Technical information</dt><dd>Depending on how you access the website, technical information such as your IP address, browser type, device information, and security logs may be processed to maintain website functionality and protect accounts.</dd>
        <dt>Support communications</dt><dd>If you contact our support team, we may retain the messages and information you provide to respond to your inquiry and maintain relevant support records.</dd>
      </dl>
      <p>Please provide only information requested through the platform’s legitimate forms and services.</p>
    </>,
  },
  {
    id: 'how-we-use', title: '2. How We Use Your Information', body: <>
      <p>We may use personal information to:</p>
      <ul>
        <li>Create and maintain your account.</li>
        <li>Provide the platform’s features and services.</li>
        <li>Contact you about account matters, important service updates, or requests you initiate.</li>
        <li>Process and maintain accurate records of relevant transactions and account activity.</li>
        <li>Review verification submissions where applicable.</li>
        <li>Detect suspicious activity, investigate potential misuse, and protect the platform and its users.</li>
        <li>Respond to customer support requests.</li>
        <li>Maintain, troubleshoot, and improve the website.</li>
        <li>Meet applicable legal, regulatory, accounting, and security obligations.</li>
      </ul>
      <p>We aim to collect and use information for legitimate purposes related to operating and protecting the platform.</p>
    </>,
  },
  {
    id: 'how-we-share', title: '3. How We Share Information', body: <>
      <p>We may share relevant information when necessary with service providers that help operate the website, such as hosting, authentication, database, customer support, identity verification, or security providers, where those services are used.</p>
      <p>We may also disclose information when required by applicable law, in response to valid legal requests, or when reasonably necessary to investigate fraud, protect users, or safeguard our legal rights.</p>
      <p>We do not intend to use your personal information for purposes unrelated to operating, maintaining, or protecting the platform without an appropriate basis.</p>
      <p>We do not sell personal information. Any sharing of information should be limited to what is reasonably necessary for the relevant purpose.</p>
    </>,
  },
  {
    id: 'how-we-protect', title: '4. How We Protect Information', body: <>
      <p>We use appropriate technical and organizational measures intended to protect personal information against unauthorized access, loss, alteration, misuse, or disclosure.</p>
      <p>Users also have an important role in protecting their accounts. We recommend using a strong, unique password, keeping email accounts secure, avoiding suspicious links, and never sharing account credentials.</p>
      <p>No website, internet transmission, or storage system can be guaranteed to be completely secure. We continually aim to maintain suitable protections for the information handled by the platform.</p>
    </>,
  },
  {
    id: 'retention', title: '5. Data Retention', body: <>
      <p>We retain personal information for as long as reasonably necessary for the purposes described in this policy, including providing services, maintaining account and transaction records, addressing disputes, protecting the platform, and meeting applicable legal obligations.</p>
      <p>Retention periods may vary according to the type of information and the reason it was collected.</p>
      <p>Where information is no longer needed and there is no legitimate reason to retain it, we will take appropriate steps to delete it or otherwise handle it in accordance with applicable requirements.</p>
    </>,
  },
  {
    id: 'cookies', title: '6. Cookies and Technical Technologies', body: <>
      <p>The website and its service providers may use cookies, session storage, or similar technologies to support essential website functions, maintain sessions, improve performance, and protect accounts.</p>
      <p>Where optional analytics or other non-essential technologies are used, they should be handled in accordance with applicable requirements and any consent choices that may be required.</p>
      <p>You can also manage cookies through your browser settings, although disabling certain cookies may affect website functionality.</p>
    </>,
  },
  {
    id: 'your-rights', title: '7. Your Privacy Choices and Rights', body: <>
      <p>Depending on applicable law and the circumstances of our processing, you may have the right to request access to your personal information, correct inaccurate details, request deletion, object to certain processing, or ask for a copy of information associated with you.</p>
      <p>You may also request clarification about how your information is used or raise a concern about its handling.</p>
      <p>Some information may need to be retained for legitimate security, legal, accounting, or transaction-record purposes. We will assess requests in accordance with applicable requirements.</p>
      <p>To make a privacy-related request, contact us at <Mail />.</p>
    </>,
  },
  {
    id: 'third-parties', title: '8. Third-Party Services', body: <>
      <p>Some features may rely on third-party services, including hosting, authentication, customer support, or verification providers.</p>
      <p>When you interact with those services, their own privacy policies and terms may also apply. We encourage you to review the relevant policies before providing information directly to a third party.</p>
      <p>Tarafab.XAi cannot guarantee the privacy or security practices of external services that it does not control.</p>
    </>,
  },
  {
    id: 'children', title: '9. Children’s Privacy', body: <>
      <p>Tarafab.XAi is intended for people who are at least 18 years old and otherwise legally eligible to use the platform in their jurisdiction.</p>
      <p>We do not knowingly intend to collect personal information from children who are not eligible to use the service. If we become aware that information has been collected in circumstances that violate applicable requirements, we will assess the appropriate steps to address it.</p>
    </>,
  },
  {
    id: 'international', title: '10. International Processing', body: <>
      <p>Depending on the service providers used to operate the platform, personal information may be processed or stored in countries other than your own.</p>
      <p>Where applicable, we will take reasonable steps to ensure that such processing is subject to appropriate safeguards and complies with relevant legal requirements.</p>
    </>,
  },
  {
    id: 'changes', title: '11. Changes to This Privacy Policy', body: <>
      <p>We may update this Privacy Policy when our services, information-handling practices, or legal obligations change.</p>
      <p>The latest version will be published on this page with its updated revision date. Where a significant change requires additional notice, we will take reasonable steps to communicate it.</p>
    </>,
  },
  {
    id: 'contact', title: '12. Contact Us', body: <>
      <p>If you have questions about this Privacy Policy, want to understand how your information is handled, or wish to make a privacy-related request, contact us at <Mail />.</p>
      <p>Website: <a href="https://tarafabxai.xyz/" className="text-accent hover:text-accent-hover underline underline-offset-4">https://tarafabxai.xyz/</a></p>
      <p>We aim to handle reasonable privacy inquiries carefully and respond in accordance with applicable requirements.</p>
    </>,
  },
]

export default function PrivacyPage() {
  return (
    <div className="site min-h-screen bg-ink-950 text-fg">
      <header className="border-b border-ink-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" aria-label="Tarafab.XAi home"><Logo /></Link>
          <Link href="/" className="text-sm text-fg-muted hover:text-fg">← Back to home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 chat-clearance" data-privacy-policy>
        <h1 className="text-[clamp(28px,7vw,40px)] leading-tight font-semibold tracking-[-0.02em]">Tarafab.XAi Privacy Policy</h1>
        <p className="mt-2 text-sm text-fg-faint" data-privacy-updated>Last updated: {LAST_UPDATED}</p>
        <div className="legal mt-8">
          <p>At Tarafab.XAi, we respect your privacy and take the protection of your personal information seriously. This Privacy Policy explains what information we may collect when you use our website, why we collect it, how it may be used, and the choices available to you.</p>
          <p>Our goal is to provide a transparent and secure experience so you can understand how your information is handled when using Tarafab.XAi.</p>
          <nav aria-label="Contents" className="legal-toc">
            <p className="legal-toc-title">Contents</p>
            <ol>{SECTIONS.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title.replace(/^\d+\.\s*/, '')}</a></li>)}</ol>
          </nav>
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-6">
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
        <p className="mt-12 pt-6 border-t border-ink-700 text-xs text-fg-faint">&copy; {new Date().getFullYear()} Tarafab.XAi</p>
      </main>
    </div>
  )
}
