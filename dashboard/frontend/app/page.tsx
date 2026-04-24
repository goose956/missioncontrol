import Link from "next/link";
import { getWorkflows, Workflow } from "@/lib/api";

export default async function Home() {
  let workflows: Workflow[] = [];
  let error = "";

  try {
    workflows = await getWorkflows();
  } catch {
    error = "Backend offline — start the API server to load workflows.";
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
        <p className="text-sm text-gray-500 mt-1">
          Each workflow is a configured Claude conversation that saves outputs to your workspace.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {workflows.length === 0 && !error && (
        <div className="text-gray-400 text-sm">No workflows found.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.map((w) => (
          <WorkflowCard key={w.id} workflow={w} />
        ))}

        <div className="border border-dashed border-gray-300 rounded-xl p-5 flex flex-col items-center justify-center text-center gap-2 text-gray-400">
          <span className="text-2xl">+</span>
          <span className="text-xs">Add a workflow<br />
            <code className="text-gray-400">dashboard/backend/workflows/*.yaml</code>
          </span>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-gray-200">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Quick Links</h2>
        <div className="flex gap-3 flex-wrap">
          <Link href="/files" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
            📁 Browse Files
          </Link>
          <Link href="/ideas" className="text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-indigo-700 transition-colors">
            💡 Ideas Lab
          </Link>
        </div>
      </div>
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  return (
    <Link
      href={`/chat/${workflow.id}`}
      className="group block bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md rounded-xl p-5 transition-all"
    >
      <div className="text-3xl mb-3">{workflow.icon}</div>
      <div className="font-semibold text-gray-900 text-sm mb-1">{workflow.name}</div>
      <div className="text-xs text-gray-500 leading-relaxed mb-3">{workflow.description}</div>
      <div className="text-xs text-gray-400">
        → <span className="font-mono">{workflow.output_folder}/</span>
      </div>
    </Link>
  );
}
