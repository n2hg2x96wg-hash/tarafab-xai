const TermsPage = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-slate-400 mt-2">Last updated: September 2026</p>
      </div>

      <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing and using Tarafab.XAi, you accept and agree to be bound by the terms and provision of this agreement.
            If you do not agree to abide by the above, please do not use this service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">2. Use License</h2>
          <p>
            Permission is granted to temporarily download one copy of the materials (information or software) on Tarafab.XAi
            for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and
            under this license you may not:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or for any public display</li>
            <li>Attempt to decompile or reverse engineer any software contained on the platform</li>
            <li>Remove any copyright or other proprietary notations from the materials</li>
            <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">3. Disclaimer</h2>
          <p>
            The materials on Tarafab.XAi are provided on an 'as is' basis. Tarafab.XAi makes no warranties, expressed or
            implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or
            conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other
            violation of rights.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">4. Limitations</h2>
          <p>
            In no event shall Tarafab.XAi or its suppliers be liable for any damages (including, without limitation, damages for
            loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on
            Tarafab.XAi, even if Tarafab.XAi or an authorized representative has been notified orally or in writing of the
            possibility of such damage.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">5. Accuracy of Materials</h2>
          <p>
            The materials appearing on Tarafab.XAi could include technical, typographical, or photographic errors. Tarafab.XAi
            does not warrant that any of the materials on the site are accurate, complete, or current. Tarafab.XAi may make
            changes to the materials contained on its site at any time without notice.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">6. Links</h2>
          <p>
            Tarafab.XAi has not reviewed all of the sites linked to its website and is not responsible for the contents of any
            such linked site. The inclusion of any link does not imply endorsement by Tarafab.XAi of the site. Use of any such
            linked website is at the user's own risk.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">7. Modifications</h2>
          <p>
            Tarafab.XAi may revise these terms of service for its website at any time without notice. By using this website,
            you are agreeing to be bound by the then current version of these terms of service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">8. Governing Law</h2>
          <p>
            These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which
            Tarafab.XAi operates, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;
