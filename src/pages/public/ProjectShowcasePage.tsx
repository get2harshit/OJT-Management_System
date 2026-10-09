import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Quote, Users } from 'lucide-react';
import SpinnerSquare from '../../components/SpinnerSquare';
import { apiGetPublicShowcase, type PublicShowcase } from '../../lib/api/studentShowcase';

/**
 * A student's project page, as a recruiter sees it.
 *
 * This is the only route in the app that renders outside ProtectedRoute and
 * the only one reachable without an account, so it carries none of the app's
 * shell: no sidebar, no auth bootstrap, no DataContext, nothing that could
 * redirect somebody who has never logged in. It reads one endpoint and draws
 * what comes back.
 *
 * Everything on screen is either the institution's own record of the project
 * or something the student wrote about their own work. The footer says which
 * is which — not to undercut the student, but because a page on an
 * institution-linked URL should not imply the institution vouched for text it
 * never saw.
 */
export default function ProjectShowcasePage() {
  const { slug = '' } = useParams();
  const [showcase, setShowcase] = useState<PublicShowcase | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    apiGetPublicShowcase(slug)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState('missing');
          return;
        }
        setShowcase(data);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Could not load this page');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // The page title is what shows in a browser tab and in a link preview, so it
  // is worth setting properly rather than leaving every student's page sharing
  // the app's generic title.
  useEffect(() => {
    if (state !== 'ready' || !showcase) return;
    const previous = document.title;
    const name = showcase.studentName ?? 'Student project';
    document.title = showcase.project?.title ? `${name} — ${showcase.project.title}` : name;
    return () => {
      document.title = previous;
    };
  }, [state, showcase]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <SpinnerSquare size={40} />
      </div>
    );
  }

  // A dead link is the expected end state of this feature, not a failure: a
  // student unpublishes, or an admin takes a page down, and the link keeps
  // existing in a PDF somebody already sent. Say so plainly and give no
  // further detail — whether a draft exists behind this address is not a
  // stranger's business.
  if (state === 'missing') {
    return (
      <CenteredNotice
        title="This page isn’t available"
        body="The link may have been taken down, or it may never have been published. If somebody shared it with you, ask them for an up-to-date link."
      />
    );
  }

  if (state === 'error' || !showcase) {
    return <CenteredNotice title="Something went wrong" body={errorMessage || 'Please try again in a moment.'} />;
  }

  const { project } = showcase;

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-200">
      {showcase.bannerUrl && (
        <div className="w-full h-40 sm:h-56 lg:h-64 overflow-hidden bg-zinc-850">
          <img
            src={showcase.bannerUrl}
            alt=""
            className="w-full h-full object-cover"
            // Decorative: the heading below carries the meaning, so a screen
            // reader announcing a filename here would only add noise.
            aria-hidden="true"
          />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        <header className="flex items-start gap-4">
          {showcase.logoUrl && (
            <img
              src={showcase.logoUrl}
              alt=""
              aria-hidden="true"
              className="w-16 h-16 rounded-xl object-cover border border-zinc-750 shrink-0 bg-zinc-850"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-balance">
              {project?.title ?? showcase.headline ?? 'Project'}
            </h1>
            {showcase.studentName && (
              <p className="text-gray-400 mt-1">
                by {showcase.studentName}
                {project?.industry ? ` · ${project.industry}` : ''}
              </p>
            )}
            {showcase.headline && project?.title && (
              <p className="text-gold mt-2 text-sm sm:text-base">{showcase.headline}</p>
            )}
          </div>
        </header>

        {showcase.productLink && (
          <a
            href={showcase.productLink}
            target="_blank"
            // noopener/noreferrer because this is a URL a student typed and we
            // are handing it to a stranger's browser — the opened page gets no
            // handle back onto this one, and no referrer.
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors"
          >
            <ExternalLink size={16} />
            View the live product
          </a>
        )}

        {project?.techStack && project.techStack.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 text-xs font-medium bg-zinc-850 border border-zinc-750 rounded-md text-gray-300"
              >
                {tech}
              </span>
            ))}
          </div>
        )}

        {/* The project as the institution recorded it — not editable by the
            student, which is what lets a recruiter read it as a record. */}
        {(project?.problemStatement || project?.description) && (
          <Section title="About the project">
            {project.problemStatement && <Prose text={project.problemStatement} />}
            {project.description && project.description !== project.problemStatement && (
              <Prose text={project.description} />
            )}
          </Section>
        )}

        {/* The student's own account, kept visibly separate from the record
            above because it is a different kind of statement. */}
        {showcase.myContribution && (
          <Section title="My contribution">
            <Prose text={showcase.myContribution} />
          </Section>
        )}

        {showcase.screenshots.length > 0 && (
          <Section title="Screenshots">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {showcase.screenshots
                .filter((shot) => shot.url)
                .map((shot, index) => (
                  <figure key={`${shot.url}-${index}`} className="space-y-2">
                    <img
                      src={shot.url as string}
                      alt={shot.caption ?? `Screenshot ${index + 1}`}
                      loading="lazy"
                      className="w-full rounded-lg border border-zinc-750 bg-zinc-850"
                    />
                    {shot.caption && (
                      <figcaption className="text-xs text-gray-500">{shot.caption}</figcaption>
                    )}
                  </figure>
                ))}
            </div>
          </Section>
        )}

        {showcase.testimonials.length > 0 && (
          <Section title="Testimonials">
            <div className="space-y-3">
              {showcase.testimonials.map((quote, index) => (
                <QuoteCard key={index} quote={quote} />
              ))}
            </div>
          </Section>
        )}

        {showcase.reviews.length > 0 && (
          <Section title="Reviews">
            <div className="space-y-3">
              {showcase.reviews.map((quote, index) => (
                <QuoteCard key={index} quote={quote} />
              ))}
            </div>
          </Section>
        )}

        {/* Shown because the project was team work. A page that presents shared
            work without saying it was shared is a misrepresentation, and this
            is the honest way to say it without diminishing what the student
            did — their own part is in "My contribution" above. */}
        {showcase.teammates.length > 0 && (
          <Section title="Built with">
            <p className="flex items-start gap-2 text-sm text-gray-400">
              <Users size={16} className="mt-0.5 shrink-0" />
              <span>{showcase.teammates.join(', ')}</span>
            </p>
          </Section>
        )}

        <footer className="pt-8 border-t border-zinc-800 text-xs text-gray-500 space-y-1">
          <p>This page is published and maintained by the student.</p>
          {showcase.publishedAt && (
            <p>Last published {new Date(showcase.publishedAt).toLocaleDateString()}.</p>
          )}
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Student-written text, rendered as text.
 *
 * Paragraph breaks are honoured and nothing else is: this is somebody's typed
 * input on a public page, so it goes through React as a string rather than
 * anything resembling dangerouslySetInnerHTML. whitespace-pre-line does the
 * line breaks without interpreting a single character.
 */
function Prose({ text }: { text: string }) {
  return <p className="text-sm sm:text-base text-gray-300 leading-relaxed whitespace-pre-line">{text}</p>;
}

function QuoteCard({ quote }: { quote: { authorName: string | null; authorRole: string | null; body: string } }) {
  return (
    <blockquote className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
      <Quote size={14} className="text-gold mb-2" />
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{quote.body}</p>
      {(quote.authorName || quote.authorRole) && (
        <footer className="mt-3 text-xs text-gray-500">
          {quote.authorName}
          {quote.authorName && quote.authorRole ? ' · ' : ''}
          {quote.authorRole}
        </footer>
      )}
    </blockquote>
  );
}

function CenteredNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-gray-400">{body}</p>
      </div>
    </div>
  );
}
