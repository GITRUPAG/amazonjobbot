
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;

-- Make the first sign-up an admin, otherwise regular user
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Region enum
CREATE TYPE public.job_region AS ENUM ('US', 'UK');

-- Jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  region job_region NOT NULL,
  title TEXT NOT NULL,
  city TEXT,
  state TEXT,
  warehouse TEXT,
  job_type TEXT,
  employment_type TEXT,
  pay_rate TEXT,
  description TEXT,
  url TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  broadcast_at TIMESTAMPTZ,
  raw JSONB,
  UNIQUE (region, external_id)
);
CREATE INDEX idx_jobs_scraped_at ON public.jobs (scraped_at DESC);
CREATE INDEX idx_jobs_region_city ON public.jobs (region, city);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage jobs" ON public.jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Search queries (admin editable scrape targets)
CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region job_region NOT NULL,
  keyword TEXT,
  city TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_queries TO authenticated;
GRANT ALL ON public.search_queries TO service_role;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage queries" ON public.search_queries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Subscribers (Telegram DM users)
CREATE TYPE public.sub_status AS ENUM ('active', 'paused', 'stopped', 'banned');

CREATE TABLE public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  chat_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  status sub_status NOT NULL DEFAULT 'active',
  regions job_region[] NOT NULL DEFAULT ARRAY['US','UK']::job_region[],
  cities TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscribers_status ON public.subscribers (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;
GRANT ALL ON public.subscribers TO service_role;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage subscribers" ON public.subscribers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Deliveries (per job per subscriber; also channel deliveries with subscriber_id NULL)
CREATE TYPE public.delivery_channel AS ENUM ('channel', 'dm');
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE CASCADE,
  channel delivery_channel NOT NULL,
  message_id BIGINT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT,
  UNIQUE (job_id, subscriber_id, channel)
);
CREATE INDEX idx_deliveries_sent_at ON public.deliveries (sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Clicks
CREATE TABLE public.clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES public.subscribers(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX idx_clicks_clicked_at ON public.clicks (clicked_at DESC);
CREATE INDEX idx_clicks_job_id ON public.clicks (job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clicks TO authenticated;
GRANT ALL ON public.clicks TO service_role;
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read clicks" ON public.clicks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Settings key/value
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default settings and default search queries (warehouse across US + UK)
INSERT INTO public.app_settings (key, value) VALUES
  ('channel_id', '""'::jsonb),
  ('scrape_interval_min', '10'::jsonb),
  ('welcome_message', '"👋 Welcome! You will receive Amazon warehouse job alerts here.\n\nUse /filter to narrow down by region, city, or keyword.\nUse /pause to stop temporarily, /resume to continue, /stop to unsubscribe."'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.search_queries (region, keyword, city, active) VALUES
  ('US', 'warehouse', NULL, true),
  ('UK', 'warehouse', NULL, true);
