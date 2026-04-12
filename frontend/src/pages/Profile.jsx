import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  UserCircle, Save, Key, Mail, Phone,
  Activity, MapPin, Heart, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { userApi } from '../api/user.api';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import {
  Card, CardHeader, CardTitle, CardContent,
  CardDescription,
} from '../components/ui/Card';

// ── Password change modal ─────────────────────────────────────────────────────
function PasswordModal({ onClose }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const mutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      toast.success('Password changed. Please log in again.');
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Failed to change password'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border p-6 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" /> Change Password
        </h3>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <Input
              type="password"
              placeholder="Enter current password"
              {...register('current_password', { required: 'Required' })}
            />
            {errors.current_password && (
              <p className="text-xs text-destructive">{errors.current_password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input
              type="password"
              placeholder="At least 6 characters"
              {...register('new_password', {
                required: 'Required',
                minLength: { value: 6, message: 'At least 6 characters' },
              })}
            />
            {errors.new_password && (
              <p className="text-xs text-destructive">{errors.new_password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              placeholder="Repeat new password"
              {...register('confirm', {
                required: 'Required',
                validate: (v) => v === watch('new_password') || 'Passwords do not match',
              })}
            />
            {errors.confirm && (
              <p className="text-xs text-destructive">{errors.confirm.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Update'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const queryClient       = useQueryClient();
  const [isEditing,      setIsEditing]      = useState(false);
  const [showPassword,   setShowPassword]   = useState(false);

  const isDoctor  = user?.role === 'doctor';
  const isPatient = user?.role === 'patient';

  // Build default values dynamically based on role
  const buildDefaults = (u) => ({
    name:            u?.name            || '',
    // Patient fields
    age:             u?.age             || '',
    gender:          u?.gender          || '',
    height:          u?.height          || '',
    weight:          u?.weight          || '',
    blood_group:     u?.blood_group     || '',
    calorie_goal:    u?.calorie_goal    || '',
    // Doctor fields
    specialisation:  u?.specialisation  || '',
    qualification:   u?.qualification   || '',
    experience_years: u?.experience_years || '',
    bio:             u?.bio             || '',
    consultation_fee: u?.consultation_fee || '',
    clinic_address:  u?.clinic_address  || '',
    phone:           u?.phone           || '',
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: buildDefaults(user),
  });

  useEffect(() => {
    if (user) reset(buildDefaults(user));
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: (data) => userApi.updateProfile(data),
    onSuccess: async (res) => {
      // Try to grab the updated user directly from the response first
      const fromResponse = res.data?.data || res.data;
      if (fromResponse?._id) {
        setUser(fromResponse);
      }

      // Then always re-fetch from server to guarantee UI consistency
      try {
        const fresh = await userApi.getProfile();
        const freshUser = fresh.data?.data || fresh.data;
        if (freshUser?._id) setUser(freshUser);
      } catch {
        // If re-fetch fails, the response data above is still applied
      }

      setIsEditing(false);
      toast.success('Profile updated!');
    },
    onError: (err) => toast.error(err.message || 'Failed to update profile'),
  });

  const onSubmit = (data) => {
    // Strip empty strings so we don't accidentally clear fields
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    // Convert numeric fields
    ['age', 'height', 'weight', 'calorie_goal', 'experience_years', 'consultation_fee'].forEach((k) => {
      if (cleaned[k]) cleaned[k] = Number(cleaned[k]);
    });
    updateMutation.mutate(cleaned);
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and {isDoctor ? 'professional' : 'health'} information.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* ── Left: Avatar card ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="text-center px-4 py-8 shadow-sm">
            <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 border-4 border-primary/20 flex items-center justify-center mb-4 overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <span className={`inline-block mt-2 text-xs font-semibold uppercase px-3 py-0.5 rounded-full border ${
              user.role === 'doctor' ? 'bg-blue-50 text-blue-600 border-blue-200' :
              user.role === 'admin'  ? 'bg-purple-50 text-purple-600 border-purple-200' :
              'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>{user.role}</span>

            {isPatient && (
              <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                <StatBox label="Blood" value={user.blood_group || '—'} />
                <StatBox label="Gender" value={user.gender || '—'} capitalize />
                <StatBox label="Height" value={user.height ? `${user.height} cm` : '—'} />
                <StatBox label="Weight" value={user.weight ? `${user.weight} kg` : '—'} />
              </div>
            )}

            {isDoctor && (
              <div className="mt-6 space-y-2 text-left">
                <StatBox label="Specialty"   value={user.specialisation      || '—'} />
                <StatBox label="Experience"  value={user.experience_years ? `${user.experience_years} yrs` : '—'} />
                <StatBox label="Fee"         value={user.consultation_fee ? `₹${user.consultation_fee}` : '—'} />
              </div>
            )}
          </Card>
        </div>

        {/* ── Right: Edit form ───────────────────────────────────────────── */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <div>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  {isDoctor ? 'Your professional details visible to patients.' : 'Your contact and health data.'}
                </CardDescription>
              </div>
              <Button
                variant={isEditing ? 'outline' : 'default'}
                size="sm"
                onClick={() => { if (isEditing) reset(buildDefaults(user)); setIsEditing((e) => !e); }}
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </CardHeader>

            <CardContent className="pt-5">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* ── Shared: name ───────────────────────────────────────── */}
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      disabled={!isEditing}
                      {...register('name', { required: 'Name is required' })}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                {/* ── Patient fields ──────────────────────────────────────── */}
                {isPatient && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Age" type="number" disabled={!isEditing}
                        reg={register('age', { min: { value: 0, message: 'Invalid' }, max: { value: 120, message: 'Invalid' } })}
                        error={errors.age} />
                      <div className="space-y-1.5">
                        <Label>Gender</Label>
                        <select
                          disabled={!isEditing}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          {...register('gender')}
                        >
                          <option value="">Select…</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <FormField label="Height (cm)" type="number" disabled={!isEditing}
                        reg={register('height', { min: 1 })} error={errors.height} />
                      <FormField label="Weight (kg)" type="number" disabled={!isEditing}
                        reg={register('weight', { min: 1 })} error={errors.weight} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Blood Group</Label>
                        <select
                          disabled={!isEditing}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          {...register('blood_group')}
                        >
                          <option value="">Select…</option>
                          {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <FormField label="Daily Calorie Goal" type="number" disabled={!isEditing}
                        reg={register('calorie_goal')} error={errors.calorie_goal} />
                    </div>
                  </>
                )}

                {/* ── Doctor fields ───────────────────────────────────────── */}
                {isDoctor && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Specialisation" disabled={!isEditing}
                        placeholder="e.g. Cardiologist"
                        reg={register('specialisation')} />
                      <FormField label="Qualification" disabled={!isEditing}
                        placeholder="e.g. MBBS, MD"
                        reg={register('qualification')} />
                      <FormField label="Experience (years)" type="number" disabled={!isEditing}
                        reg={register('experience_years', { min: 0 })}
                        error={errors.experience_years} />
                      <FormField label="Consultation Fee (₹)" type="number" disabled={!isEditing}
                        reg={register('consultation_fee', { min: 0 })}
                        error={errors.consultation_fee} />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" disabled={!isEditing} placeholder="+91 98765 43210" {...register('phone')} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Clinic Address</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <textarea
                          rows={2}
                          disabled={!isEditing}
                          placeholder="Clinic name, street, city"
                          className="flex w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          {...register('clinic_address')}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Bio</Label>
                      <textarea
                        rows={3}
                        disabled={!isEditing}
                        placeholder="Brief professional bio…"
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                        {...register('bio')}
                      />
                    </div>
                  </>
                )}

                {isEditing && (
                  <div className="flex justify-end pt-2 border-t">
                    <Button type="submit" className="gap-2" disabled={updateMutation.isPending}>
                      {updateMutation.isPending
                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                        : <><Save className="h-4 w-4" /> Save Changes</>}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Security card */}
          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Manage your password and account access.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                onClick={() => setShowPassword(true)}
              >
                <Key className="h-4 w-4" /> Change Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatBox({ label, value, capitalize }) {
  return (
    <div className="bg-muted/50 p-2.5 rounded-lg border">
      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">{label}</p>
      <p className={`font-semibold text-sm text-primary ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}

function FormField({ label, reg, error, type = 'text', disabled, placeholder }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} disabled={disabled} placeholder={placeholder} {...reg} />
      {error && <p className="text-xs text-destructive">{error.message || 'Invalid'}</p>}
    </div>
  );
}