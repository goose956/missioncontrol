import { getWorkflows } from "@/lib/api";
import AdCreatorWorkspace from "@/components/AdCreatorWorkspace";
import CodeAssistantWorkspace from "@/components/CodeAssistantWorkspace";
import ChatInterface from "@/components/ChatInterface";
import SpecificationWorkspace from "@/components/SpecificationWorkspace";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ workflow: string }>;
}

export default async function ChatPage({ params }: Props) {
  const { workflow: workflowId } = await params;

  let workflows;
  try {
    workflows = await getWorkflows();
  } catch {
    return (
      <div className="p-8 text-red-400 text-sm">
        Backend offline — start the API server.
      </div>
    );
  }

  const workflow = workflows.find((w) => w.id === workflowId);
  if (!workflow) notFound();

  if (workflow.id === "spec-bot") {
    return <SpecificationWorkspace workflow={workflow} />;
  }

  if (workflow.id === "coder") {
    return <CodeAssistantWorkspace workflow={workflow} />;
  }

  if (workflow.id === "ad-creator") {
    return <AdCreatorWorkspace workflow={workflow} />;
  }

  return <div className="h-screen"><ChatInterface workflow={workflow} /></div>;
}
