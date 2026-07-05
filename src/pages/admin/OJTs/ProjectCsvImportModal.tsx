import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import Modal from '../../../components/Modal';
import type { Project } from '../../../lib/types';
import { parseCSV } from '../../../lib/csv';
import { TRACKS } from '../../../lib/constants';
import { useToast } from '../../../toast';

interface ProjectCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  addProjects: (projs: Omit<Project, 'id' | 'created_at'>[]) => void;
}

export default function ProjectCsvImportModal({ open, onClose, addProjects }: ProjectCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();

  const handleClose = () => {
    setCsvText('');
    onClose();
  };

  const handleUpload = () => {
    if (!csvText) return;
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return;

    const projs = parsed.slice(1).map(cols => {
      if (cols.length < 2) return null;
      return {
        title: cols[0],
        description: cols[1],
        track: cols[2] || TRACKS[0],
        end_goals: cols[3] || '',
        related_field: cols[4] || '',
        source: 'Listed' as const
      };
    }).filter(Boolean) as Omit<Project, 'id' | 'created_at'>[];

    if (projs.length > 0) {
      addProjects(projs);
      showSuccess(`Successfully imported ${projs.length} project templates!`);
    }

    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Project templates via CSV">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Upload or paste a CSV of project catalog templates.
        </p>

        <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
          <span className="text-gold">Expected Format:</span>
          <div className="text-white">title,description,track,end_goals,related_field</div>
          <span className="text-gray-500 block pt-1">Example Row:</span>
          <div className="truncate">E-Commerce Marketplace,Full stack stripe checkout,Product Development,Working checkout,React Node Stripe</div>
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
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gold/10 file:text-gold hover:file:bg-gold/20"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={5}
            placeholder="title,description,track,end_goals,related_field..."
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!csvText}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={18} />
          Import Project Catalog
        </button>
      </div>
    </Modal>
  );
}
