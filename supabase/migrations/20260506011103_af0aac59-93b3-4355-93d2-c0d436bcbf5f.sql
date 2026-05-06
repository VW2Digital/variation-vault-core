CREATE TABLE public.recommendation_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  source_product_id UUID,
  load_time_ms INTEGER NOT NULL,
  skeleton_time_ms INTEGER NOT NULL,
  items_count INTEGER NOT NULL DEFAULT 0,
  had_error BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recommendation_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert recommendation metrics"
ON public.recommendation_performance_metrics
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view recommendation metrics"
ON public.recommendation_performance_metrics
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete recommendation metrics"
ON public.recommendation_performance_metrics
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_rec_perf_metrics_created_at ON public.recommendation_performance_metrics(created_at DESC);
CREATE INDEX idx_rec_perf_metrics_source_product ON public.recommendation_performance_metrics(source_product_id);