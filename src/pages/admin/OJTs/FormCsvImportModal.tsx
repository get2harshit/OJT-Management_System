import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import type { Profile } from '../../../lib/types';
import { parseCSV } from '../../../lib/csv';
import { useMentors } from '../../../hooks/useMentors';
import { useToast } from '../../../toast';
import type { OJTBatchStudentRecord } from '../../../context/DataContext';

interface CohortOption {
  id: string;
  label: string;
}

interface FormCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  cohortOptions?: CohortOption[];
  profiles: Profile[];
  importOJTBatch: (cohortId: string, studentRecords: OJTBatchStudentRecord[], batchName?: string, semesterName?: string) => void;
  defaultCohortId?: string;
  defaultBatchName?: string;
  defaultSemesterName?: string;
  onImportSuccess?: () => void;
}

// Imports the "OJT student choices" Google Form CSV export: one row per
// student response, fuzzy-matched against existing mentors by name to
// pre-fill their preferred mentor.
export default function FormCsvImportModal({
  open,
  onClose,
  cohortOptions = [],
  profiles,
  importOJTBatch,
  defaultCohortId,
  defaultBatchName,
  defaultSemesterName,
  onImportSuccess
}: FormCsvImportModalProps) {
  const [selectedCohortId, setSelectedCohortId] = useState(defaultCohortId || '');
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const mentors = useMentors(profiles);
  const { showSuccess } = useToast();

  useEffect(() => {
    if (open) {
      setSelectedCohortId(defaultCohortId || '');
    }
  }, [open, defaultCohortId]);

  const handleClose = () => {
    setSelectedCohortId(defaultCohortId || '');
    setCsvText('');
    onClose();
  };

  const handleUpload = () => {
    if (!selectedCohortId || !csvText) return;
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return;

    const headers = parsed[0].map(h => h.toLowerCase());

    const nameIdx = headers.findIndex(h => h.includes('student name') || h.includes('name'));
    const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('phone') || h.includes('number'));
    const trackIdx = headers.findIndex(h => h.includes('track') || h.includes('domain'));
    const mentorIdx = headers.findIndex(h => h.includes('mentorship') || h.includes('preference 1') || h.includes('mentor'));
    const choiceIdx = headers.findIndex(h => h.includes('own project') || h.includes('select between') || h.includes('choice'));
    const titleIdx = headers.findIndex(h => h.includes('project title') || (h.includes('title') && !h.includes('track')));
    const descIdx = headers.findIndex(h => h.includes('project description') || h.includes('description'));
    const stackIdx = headers.findIndex(h => h.includes('stack') || h.includes('framework') || h.includes('tech'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('username'));

    const records = parsed.slice(1).map((cols, idx) => {
      if (cols.length < 2) return null;

      const name = nameIdx !== -1 ? cols[nameIdx] : `Student ${idx + 1}`;
      const contact = contactIdx !== -1 ? cols[contactIdx] : '';
      const email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx] : `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}${idx + 1}@ojt.edu`;
      const trackRaw = trackIdx !== -1 ? cols[trackIdx] : 'Product Development';

      let track = 'Product Development';
      if (trackRaw.toLowerCase().includes('app')) track = 'Application Development';
      else if (trackRaw.toLowerCase().includes('data')) track = 'Data Scientist';
      else if (trackRaw.toLowerCase().includes('open')) track = 'Open Source';
      else if (trackRaw.toLowerCase().includes('gen')) track = 'Gen AI';

      const mentorPrefRaw = mentorIdx !== -1 ? cols[mentorIdx] : '';
      const matchedMentor = mentors.find(m =>
        m.name.toLowerCase().replace(/\s/g, '').includes(mentorPrefRaw.toLowerCase().replace(/\s/g, '')) ||
        mentorPrefRaw.toLowerCase().replace(/\s/g, '').includes(m.name.toLowerCase().replace(/\s/g, ''))
      );
      const preferred_mentors = matchedMentor ? [matchedMentor.id] : [];

      const choiceRaw = choiceIdx !== -1 ? cols[choiceIdx] : 'Own';
      const is_own_project = choiceRaw.toLowerCase().includes('own');

      const project_title = titleIdx !== -1 ? cols[titleIdx] : '';
      const project_description = descIdx !== -1 ? cols[descIdx] : '';
      const tech_stack = stackIdx !== -1 ? cols[stackIdx] : '';

      return {
        name,
        email,
        contact_no: contact,
        track,
        preferred_mentors,
        is_own_project,
        project_title,
        project_description,
        tech_stack
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (records.length > 0) {
      importOJTBatch(selectedCohortId, records, defaultBatchName, defaultSemesterName);
      showSuccess(`Successfully imported ${records.length} students from the OJT form responses!`);
      onImportSuccess?.();
    }

    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import OJT Student Responses (Google Form CSV)">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          {defaultCohortId
            ? "Upload or paste your OJT student choices Google Form CSV report."
            : "Select a target cohort, and upload/paste your OJT student choices Google Form CSV report."}
        </p>

        {!defaultCohortId && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target OJT Cohort *</label>
            <Select
              value={selectedCohortId}
              onChange={setSelectedCohortId}
              className="w-full"
              placeholder="Select Cohort..."
              options={cohortOptions.map(c => ({ value: c.id, label: c.label }))}
            />
          </div>
        )}

        <div className="bg-zinc-800/40 p-3 rounded-lg text-[10px] font-mono text-gray-400 space-y-1">
          <span className="text-gold font-bold">Expected Headers:</span>
          <div className="truncate text-white font-semibold">Student Name,Contact No.,Select Your Project Track,Mentorship Guidance Request – Preference 1,Select Between Own Project vs. Picking Up a Project,Project Title,Project Description,tech stack</div>
          <span className="text-gray-500 block pt-1">Example Row:</span>
          <div className="truncate">John Doe,9876543210,Application Development,Rohit Gupta,Own Project,Social Network App,MERN stack feeds,React Node Mongo</div>
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setCsvText(ev.target?.result as string);
              reader.readAsText(file);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-gold border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Choose File
          </button>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={5}
            placeholder="Paste raw CSV content here..."
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!selectedCohortId || !csvText}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={18} />
          Import Student Responses
        </button>
      </div>
    </Modal>
  );
}
