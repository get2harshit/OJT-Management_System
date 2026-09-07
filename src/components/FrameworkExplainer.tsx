import { ChevronDown } from 'lucide-react';
import { FRAMEWORK_PARAMETERS, FRAMEWORK_DIMENSIONS, RATING_LEVELS } from '../lib/api/skillAssessments';

const PARAMETER_BY_KEY = new Map(FRAMEWORK_PARAMETERS.map((parameter) => [parameter.key, parameter]));

/**
 * The rubric itself, and what the scale means — reference material, not a
 * result. Shared by every surface that shows an assessment (student, mentor,
 * admin) so what the framework measures is written once and can't drift
 * between them — the same reason the parameter list itself is a single
 * source (see FRAMEWORK_PARAMETERS).
 *
 * Collapsed by default and rendered whether or not there is any assessment
 * yet: someone who hasn't been rated, or hasn't rated anyone, is exactly who
 * most needs to see what they will be judged on.
 */
export default function FrameworkExplainer() {
  return (
    <details className="group bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <summary className="text-xs text-gray-400 uppercase tracking-wider font-medium cursor-pointer list-none flex items-center gap-1.5">
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
        How this framework works
      </summary>

      <div className="mt-4 space-y-5">
        <p className="text-xs text-gray-500 leading-relaxed">
          Ten parameters are rated, grouped into the three capability dimensions below. Each dimension is the average
          of its own parameters, and the overall rating is the average of the three dimensions.
        </p>

        {FRAMEWORK_DIMENSIONS.map((dimension) => (
          <div key={dimension.key} className="border-t border-zinc-800 pt-4">
            <p className="text-sm font-semibold text-white">{dimension.label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{dimension.guidingQuestion}</p>

            <ul className="mt-3 space-y-2.5">
              {dimension.parameters.map((parameterKey) => {
                const parameter = PARAMETER_BY_KEY.get(parameterKey);
                if (!parameter) return null;
                return (
                  <li key={parameterKey} className="border-l-2 border-zinc-750 pl-3">
                    <p className="text-xs text-gray-300">{parameter.label}</p>
                    <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{parameter.guidingQuestion}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-2.5">What the ratings mean</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {RATING_LEVELS.map((level) => (
              <p key={level.value} className="text-[11px] text-gray-500">
                <span className="text-gray-300 font-semibold">
                  {level.value} — {level.label}
                </span>{' '}
                {level.description}
              </p>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
