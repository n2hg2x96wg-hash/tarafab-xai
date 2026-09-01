import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { faqItems, helpArticles } from '../data/faq';
import { useToast } from '../components/ui/Toast';

function FaqAccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 py-3 last:border-none dark:border-navy-600/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{question}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <p className="animate-fade-in mt-2 text-sm text-slate-500 dark:text-slate-400">{answer}</p>}
    </div>
  );
}

export function Support() {
  const { showToast } = useToast();
  const [subject, setSubject] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    showToast('Support request submitted successfully.');
    setSubject('');
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">FAQs, help articles, and contact support.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
          <div>
            {faqItems.map((item) => (
              <FaqAccordionItem key={item.id} question={item.question} answer={item.answer} />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Contact Support</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Subject
              <input
                type="text"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="How can we help?"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700"
              />
            </label>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Message
              <textarea
                required
                rows={4}
                placeholder="Describe your question or issue..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 dark:border-navy-500 dark:bg-navy-700"
              />
            </label>
            <button
              type="submit"
              className="mt-2 self-start rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-105"
            >
              Send Message
            </button>
          </form>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Help Center</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {helpArticles.map((article) => (
            <div
              key={article.id}
              className="rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-md hover:-translate-y-0.5 dark:border-navy-600/60 dark:hover:shadow-teal-500/20"
            >
              <span className="text-xs font-semibold tracking-wide text-teal-600 uppercase dark:text-teal-400">
                {article.category}
              </span>
              <h3 className="mt-1 font-medium text-slate-800 dark:text-slate-100">{article.title}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{article.summary}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
