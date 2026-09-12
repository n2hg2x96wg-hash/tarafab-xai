const PrivacyPage = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-slate-400 mt-2">Last updated: September 2026</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">1. Information We Collect</h2>
          <p>
            We may collect information about you in a variety of ways. The information we may collect on the site includes:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>Personal Data:</strong> Name, email address, phone number, and payment information</li>
            <li><strong>Device Data:</strong> IP address, browser type, operating system, and device identifiers</li>
            <li><strong>Usage Data:</strong> Pages visited, time spent, and interactions with the platform</li>
            <li><strong>Financial Data:</strong> Transaction history, account balances, and portfolio information</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">2. Use of Your Information</h2>
          <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience.</p>
          <p>Specifically, we may use information collected about you via the site to:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Create and manage your account</li>
            <li>Process transactions and send related information</li>
            <li>Fulfill your requests and respond to inquiries</li>
            <li>Improve our website and services</li>
            <li>Prevent fraudulent transactions and protect against illegal activity</li>
            <li>Comply with legal and regulatory requirements</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">3. Disclosure of Your Information</h2>
          <p>
            We may share your information in the following situations:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li><strong>By Law or to Protect Rights:</strong> If required by law or to protect our legal rights</li>
            <li><strong>Third-Party Service Providers:</strong> To vendors who assist us in operating our website and conducting our business</li>
            <li><strong>Business Transfers:</strong> If Tarafab.XAi is involved in a merger, acquisition, or sale of assets</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">4. Security of Your Information</h2>
          <p>
            We use administrative, technical, and physical security measures to protect your personal information. However, no
            method of transmission over the Internet or method of electronic storage is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">5. Contact Us</h2>
          <p>
            If you have questions or comments about this Privacy Policy, please contact us at: privacy@tarafab.com
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPage;
