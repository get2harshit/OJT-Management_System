import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import { useToast } from '../../toast';
import {
  apiAddShowcaseQuote,
  apiGetMyShowcase,
  apiPublishMyShowcase,
  apiRemoveShowcaseQuote,
  apiRemoveShowcaseScreenshot,
  apiUpdateMyShowcase,
  apiUploadShowcaseAsset,
  type MyShowcase,
} from '../../lib/api/studentShowcase';

const QUOTE_KIND_OPTIONS = [
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'review', label: 'Review' },
];

/**
 * Where a student builds the page they will put on a resume.
 *
 * Saving and publishing are separate actions throughout. The page already has
 * a permanent link, which may already be in a PDF somebody sent out, so an
 * edit has to be able to land without a recruiter seeing a half-written
 * sentence — and unpublishing has to break the page rather than the URL.
 */
export default function StudentPortfolio() {
  const { showSuccess, showError } = useToast();
  const [showcase, setShowcase] = useState<MyShowcase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Local copies of the text fields so typing is not a request per keystroke.
  const [headline, setHeadline] = useState('');
  const [contribution, setContribution] = useState('');
  const [productLink, setProductLink] = useState('');

  const [quoteKind, setQuoteKind] = useState('testimonial');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [quoteRole, setQuoteRole] = useState('');
  const [quoteBody, setQuoteBody] = useState('');

  const screenshotInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const adopt = useCallback((next: MyShowcase) => {
    setShowcase(next);
    setHeadline(next.headline ?? '');
    setContribution(next.myContribution ?? '');
    setProductLink(next.productLink ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGetMyShowcase()
      .then((data) => {
        if (!cancelled) adopt(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your page');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const publicUrl = showcase ? `${window.location.origin}/p/${showcase.slug}` : '';

  const save = async () => {
    if (!showcase) return;
    setSaving(true);
    try {
      adopt(
        await apiUpdateMyShowcase(showcase.id, {
          headline,
          myContribution: contribution,
          productLink,
        })
      );
      showSuccess(showcase.isPublished ? 'Saved — your live page is updated' : 'Saved to your draft');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async () => {
    if (!showcase) return;
    const publish = !showcase.isPublished;
    try {
      adopt(await apiPublishMyShowcase(showcase.id, publish));
      showSuccess(publish ? 'Your page is live' : 'Your page is no longer public');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not change publishing');
    }
  };

  const upload = async (kind: 'logo' | 'banner' | 'screenshot', file: File | undefined) => {
    if (!showcase || !file) return;
    setUploading(kind);
    try {
      adopt(await apiUploadShowcaseAsset(showcase.id, kind, file));
      showSuccess('Image uploaded');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not upload that image');
    } finally {
      setUploading(null);
    }
  };

  const addQuote = async () => {
    if (!showcase) return;
    if (!quoteBody.trim()) {
      showError('Add some text first');
      return;
    }
    try {
      adopt(
        await apiAddShowcaseQuote(showcase.id, {
          kind: quoteKind as 'review' | 'testimonial',
          authorName: quoteAuthor.trim() || undefined,
          authorRole: quoteRole.trim() || undefined,
          body: quoteBody.trim(),
        })
      );
      setQuoteAuthor('');
      setQuoteRole('');
      setQuoteBody('');
      showSuccess('Added');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not add that');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showError('Could not copy — select the link and copy it by hand');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={40} />
      </div>
    );
  }

  if (loadError || !showcase) {
    return <p role="alert" className="py-8 text-center text-sm text-red-400">{loadError || 'No page found'}</p>;
  }

  return (
    <PageLayout className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Project Page</h1>
        <p className="text-gray-400 text-sm mt-1">
          One link you can put on a resume. You decide what it shows, and you can change it any time.
        </p>
      </div>

      {/* Shown before anything else when an admin has taken the page down: a
          student finding a dead link with no explanation would reasonably
          assume a bug and keep sharing it. */}
      {showcase.unpublishedByAdmin && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-red-300 font-semibold">This page was taken down by an administrator</p>
            {showcase.unpublishedByAdmin.reason && (
              <p className="text-gray-300 mt-1">{showcase.unpublishedByAdmin.reason}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              Fix what was raised and publish again, or speak to your batch manager.
            </p>
          </div>
        </div>
      )}

      {/* The link and its state, first, because this is what the page is for. */}
      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Your link</p>
            <p className="text-sm text-gray-200 font-mono truncate mt-0.5">{publicUrl}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {showcase.isPublished && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <ExternalLink size={14} />
                Open
              </a>
            )}
            <button
              onClick={togglePublished}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                showcase.isPublished
                  ? 'border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800'
                  : 'bg-gold text-black hover:bg-gold-hover'
              }`}
            >
              {showcase.isPublished ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {showcase.isPublished
            ? 'Live — anyone with this link can see it. The link stays the same when you edit.'
            : 'Not published yet. The link already exists but shows nothing until you publish.'}
        </p>
      </section>

      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">About your work</h2>

        {showcase.project ? (
          <p className="text-xs text-gray-500">
            Project: <span className="text-gray-300">{showcase.project.title}</span> — its title, problem
            statement and tech stack come from your OJT record and appear on the page automatically.
          </p>
        ) : (
          <p className="text-xs text-amber-400/80">
            No project allocated yet. You can still build this page — the project details will appear here
            once your project is assigned.
          </p>
        )}

        <Field label="Headline" hint="One line under your name. Optional.">
          <input
            value={headline}
            maxLength={160}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="e.g. Built the payments flow and the admin dashboard"
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </Field>

        <Field
          label="My contribution"
          hint="What you personally did. This is the part a recruiter reads most closely."
        >
          <textarea
            value={contribution}
            maxLength={4000}
            rows={7}
            onChange={(event) => setContribution(event.target.value)}
            placeholder="What you built, what you decided, what was hard."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-y"
          />
          <p className="text-[11px] text-gray-600 mt-1 text-right tabular-nums">{contribution.length}/4000</p>
        </Field>

        <Field label="Product link" hint="Where the live thing is, if it is online.">
          <input
            value={productLink}
            onChange={(event) => setProductLink(event.target.value)}
            placeholder="https://..."
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </Field>

        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold bg-gold text-black rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </section>

      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Images</h2>
        <p className="text-xs text-gray-500">PNG, JPEG or WebP, up to 5MB each.</p>

        <div className="flex flex-wrap gap-3">
          <AssetSlot
            label="Logo"
            url={showcase.logoUrl}
            busy={uploading === 'logo'}
            onPick={() => logoInput.current?.click()}
          />
          <AssetSlot
            label="Banner"
            url={showcase.bannerUrl}
            busy={uploading === 'banner'}
            onPick={() => bannerInput.current?.click()}
            wide
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Screenshots ({showcase.screenshots.length}/12)</p>
            <button
              onClick={() => screenshotInput.current?.click()}
              disabled={uploading === 'screenshot' || showcase.screenshots.length >= 12}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              <Upload size={12} />
              {uploading === 'screenshot' ? 'Uploading...' : 'Add screenshot'}
            </button>
          </div>
          {showcase.screenshots.length === 0 ? (
            <p className="text-xs text-gray-600">No screenshots yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {showcase.screenshots.map((shot) => (
                <div key={shot.id} className="relative group">
                  {shot.url ? (
                    <img
                      src={shot.url}
                      alt={shot.caption ?? ''}
                      className="w-full h-24 object-cover rounded-lg border border-zinc-750"
                    />
                  ) : (
                    <div className="w-full h-24 rounded-lg border border-zinc-750 bg-zinc-900 flex items-center justify-center">
                      <ImageIcon size={16} className="text-gray-600" />
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        adopt(await apiRemoveShowcaseScreenshot(showcase.id, shot.id));
                      } catch (err) {
                        showError(err instanceof Error ? err.message : 'Could not remove that');
                      }
                    }}
                    aria-label="Remove screenshot"
                    className="absolute top-1 right-1 p-1.5 rounded-md bg-black/70 text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            upload('logo', event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <input
          ref={bannerInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            upload('banner', event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <input
          ref={screenshotInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            upload('screenshot', event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </section>

      <section className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Testimonials and reviews ({showcase.quotes.length}/20)
        </h2>

        {showcase.quotes.length > 0 && (
          <div className="space-y-2">
            {showcase.quotes.map((quote) => (
              <div
                key={quote.id}
                className="flex items-start justify-between gap-3 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {quote.kind}
                  </p>
                  <p className="text-sm text-gray-200 mt-0.5 whitespace-pre-line">{quote.body}</p>
                  {(quote.authorName || quote.authorRole) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {quote.authorName}
                      {quote.authorName && quote.authorRole ? ' · ' : ''}
                      {quote.authorRole}
                    </p>
                  )}
                </div>
                <button
                  onClick={async () => {
                    try {
                      adopt(await apiRemoveShowcaseQuote(showcase.id, quote.id));
                    } catch (err) {
                      showError(err instanceof Error ? err.message : 'Could not remove that');
                    }
                  }}
                  aria-label="Remove"
                  className="p-1.5 rounded-md text-gray-500 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={quoteKind} onChange={setQuoteKind} options={QUOTE_KIND_OPTIONS} variant="filter" />
          <input
            value={quoteAuthor}
            maxLength={120}
            onChange={(event) => setQuoteAuthor(event.target.value)}
            placeholder="Who said it"
            className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
          <input
            value={quoteRole}
            maxLength={120}
            onChange={(event) => setQuoteRole(event.target.value)}
            placeholder="Their role"
            className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
        </div>
        <textarea
          value={quoteBody}
          maxLength={1200}
          rows={3}
          onChange={(event) => setQuoteBody(event.target.value)}
          placeholder="What they said about your work"
          className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-y"
        />
        <button
          onClick={addQuote}
          disabled={showcase.quotes.length >= 20}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
        >
          <Plus size={13} />
          Add
        </button>
        <p className="text-[11px] text-gray-600">
          Your page says it is published and maintained by you, so readers know these are quotes you added
          yourself.
        </p>
      </section>
    </PageLayout>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-gray-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function AssetSlot({
  label,
  url,
  busy,
  onPick,
  wide,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  onPick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      disabled={busy}
      className={`relative rounded-lg border border-dashed border-zinc-700 bg-zinc-900 hover:border-gold transition-colors overflow-hidden shrink-0 disabled:opacity-50 ${
        wide ? 'w-48 h-20' : 'w-20 h-20'
      }`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="flex flex-col items-center justify-center w-full h-full gap-1 text-gray-500">
          <ImageIcon size={16} />
          <span className="text-[10px] font-semibold uppercase tracking-wider">{busy ? '...' : label}</span>
        </span>
      )}
    </button>
  );
}
