begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.sound_categories (id, name) values ('e8f96d56-81d6-4f5f-9c97-c8fbdf1ad7e0', 'Soundpad Test');
insert into public.sounds (id, status, name, source_name, source_kind, source_bytes, category_id,
  source_duration_ms, waveform, trim_start_ms, trim_end_ms, duration_ms, clip_path)
values
  ('70b072e3-f733-4cf0-877b-8e79a03caa32', 'ready', 'Published', 'source.wav', 'wav', 10000,
   'e8f96d56-81d6-4f5f-9c97-c8fbdf1ad7e0', 1000, array[0.5]::real[], 0, 1000, 1000,
   '70b072e3-f733-4cf0-877b-8e79a03caa32/70b072e3-f733-4cf0-877b-8e79a03caa33.mp3'),
  ('70b072e3-f733-4cf0-877b-8e79a03caa34', 'draft', 'Unpublished', 'other.wav', 'wav', 10000,
   null, null, null, null, null, null, null),
  ('70b072e3-f733-4cf0-877b-8e79a03caa35', 'deleting', 'Removed', 'other.wav', 'wav', 10000,
   null, null, null, null, null, null, null);

select is((select public from storage.buckets where id = 'soundpad-sources'), false, 'source bucket is private');
select is((select public from storage.buckets where id = 'soundpad-clips'), true, 'clips can be streamed publicly');

select lives_ok(
  'insert into storage.objects (bucket_id, name) values (''soundpad-sources'', ''70b072e3-f733-4cf0-877b-8e79a03caa34/original.wav'')',
  'storage can finalize a live draft'
);
select throws_ok(
  'insert into storage.objects (bucket_id, name) values (''soundpad-sources'', ''70b072e3-f733-4cf0-877b-8e79a03caa35/original.wav'')',
  '23514', null, 'storage cannot finalize a draft being deleted'
);
select throws_ok(
  'insert into storage.objects (bucket_id, name) values (''soundpad-clips'', ''70b072e3-f733-4cf0-877b-8e79a03caa36/70b072e3-f733-4cf0-877b-8e79a03caa37.mp3'')',
  '23514', null, 'storage cannot finalize an output after its sound is gone'
);

set local role anon;
select results_eq('select name from public.sounds where id::text like ''70b072e3-%''', array['Published'], 'public sees only ready pads');
select throws_ok('select source_name from public.sounds', '42501', null, 'public cannot read source metadata');
select throws_ok('insert into public.sound_categories (name) values (''Unauthorized'')', '42501', null, 'public cannot add categories');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{},"user_metadata":{"soundpad_admin":true}}';
select throws_ok('insert into public.sound_categories (name) values (''Unauthorized'')', '42501', null, 'user metadata cannot grant admin access');
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"soundpad_admin":true}}';
select lives_ok('insert into public.sound_categories (name) values (''Authorized'')', 'admin can add categories');
select throws_ok(
  'delete from public.sound_categories where id = ''e8f96d56-81d6-4f5f-9c97-c8fbdf1ad7e0''',
  '23503', null, 'cannot delete a category containing a sound'
);
reset role;
select * from finish();
rollback;
