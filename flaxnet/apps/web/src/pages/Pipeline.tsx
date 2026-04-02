import { useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLeads, fetchPipelineStages, patchLeadStage } from '@/lib/api';
import type { LeadListRow, PipelineStage } from '@/types';

function scoreBadgeClass(score: number | null) {
  if (score === null || score === undefined) return 'bg-slate-700 text-slate-300';
  if (score > 70) return 'bg-emerald-900/80 text-emerald-200';
  if (score >= 40) return 'bg-amber-900/80 text-amber-200';
  return 'bg-red-900/80 text-red-200';
}

function LeadCard({ lead }: { lead: LeadListRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: isDragging ? 10 : undefined }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded border border-slate-700 bg-slate-800/90 p-2 text-left text-sm active:cursor-grabbing ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <p className="font-medium text-slate-100">{lead.address}</p>
      <p className="text-xs text-slate-500">
        {lead.city}, {lead.state}
      </p>
      <span
        className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${scoreBadgeClass(lead.aiScore)}`}
      >
        {lead.aiScore ?? '—'}
      </span>
    </div>
  );
}

function StageColumn({
  stage,
  leads,
  firstStageId,
}: {
  stage: PipelineStage;
  leads: LeadListRow[];
  firstStageId: string | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const columnLeads = useMemo(() => {
    return leads.filter(
      (l) => l.stageId === stage.id || (!l.stageId && stage.id === firstStageId)
    );
  }, [leads, stage.id, firstStageId]);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 shrink-0 flex-col rounded-lg border border-slate-800 bg-slate-900/50 ${
        isOver ? 'ring-1 ring-indigo-500' : ''
      }`}
    >
      <div className="border-b border-slate-800 px-2 py-2 text-sm font-medium text-slate-200">
        {stage.name}
        <span className="ml-1 text-xs text-slate-500">({columnLeads.length})</span>
      </div>
      <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-2 overflow-y-auto p-2">
        {columnLeads.map((l) => (
          <LeadCard key={l.id} lead={l} />
        ))}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const stagesQ = useQuery({ queryKey: ['pipeline-stages'], queryFn: fetchPipelineStages });
  const leadsQ = useQuery({
    queryKey: ['leads', 'pipeline'],
    queryFn: () => fetchLeads({ limit: 500 }),
  });

  const moveMu = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      patchLeadStage(leadId, stageId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['leads', 'pipeline'] });
    },
  });

  const stages = stagesQ.data ?? [];
  const firstStageId = stages.length ? stages[0]!.id : undefined;
  const leads = leadsQ.data ?? [];

  function resolveDropStage(overId: string): string | null {
    if (stages.some((s) => s.id === overId)) return overId;
    const hitLead = leads.find((l) => l.id === overId);
    if (hitLead) return hitLead.stageId || firstStageId || null;
    return null;
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const leadId = String(active.id);
    const overId = String(over.id);
    if (leadId === overId) return;
    const targetStageId = resolveDropStage(overId);
    if (!targetStageId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const current = lead.stageId || firstStageId;
    if (current === targetStageId) return;
    moveMu.mutate({ leadId, stageId: targetStageId });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Pipeline</h1>
      <p className="mt-1 text-sm text-slate-400">Drag cards between stages. Status updates with the stage.</p>

      {(stagesQ.isLoading || leadsQ.isLoading) && <p className="mt-4 text-slate-500">Loading…</p>}
      {(stagesQ.isError || leadsQ.isError) && (
        <p className="mt-4 text-red-400">
          {(stagesQ.error as Error)?.message || (leadsQ.error as Error)?.message}
        </p>
      )}

      {stages.length > 0 && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="mt-6 flex gap-3 overflow-x-auto pb-4">
            {stages.map((s) => (
              <StageColumn key={s.id} stage={s} leads={leads} firstStageId={firstStageId} />
            ))}
          </div>
        </DndContext>
      )}

      {moveMu.isError && (
        <p className="mt-2 text-sm text-red-400">{(moveMu.error as Error).message}</p>
      )}
    </div>
  );
}
