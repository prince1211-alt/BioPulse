import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { UserCircle, Save, Key, Mail, Phone, Calendar as CalendarIcon, MapPin, Activity } from 'lucide-react';

import { authApi } from '../api/auth.api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../components/ui/Card';

export function ProfilePage() {
  const { user, setAuth } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      date_of_birth: user?.date_of_birth ? new Date(user.date_of_birth).toISOString().split('T')[0] : '',
      blood_group: user?.blood_group || '',
      gender: user?.gender || '',
      address: user?.address || '',
    }
  });

  // Effect to handle if user gets populated later
  useEffect(() => {
    if (user) {
      reset({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        date_of_birth: user.date_of_birth ? new Date(user.date_of_birth).toISOString().split('T')[0] : '',
        blood_group: user.blood_group || '',
        gender: user.gender || '',
        address: user.address || '',
      });
    }
  }, [user, reset]);

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      const res = await authApi.updateProfile(data);
      const updatedUser = res.data?.user || res.user || res;
      setAuth(updatedUser, localStorage.getItem('accessToken'));
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings and health profile.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column - Avatar & Quick Info */}
        <div className="space-y-6 md:col-span-1">
          <Card className="shadow-soft shadow-primary/5 text-center px-4 py-8">
            <div className="mx-auto h-28 w-28 rounded-full bg-primary/10 border-4 border-primary/20 flex flex-col items-center justify-center mb-4">
               {user?.avatar_url ? (
                 <img src={user.avatar_url} alt={user.name} className="h-full w-full rounded-full object-cover" />
               ) : (
                 <span className="text-4xl font-semibold text-primary">{user?.name?.charAt(0) || 'U'}</span>
               )}
            </div>
            <h2 className="text-xl font-bold">{user?.name}</h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            
            <div className="mt-8 grid grid-cols-2 gap-4 text-left">
               <div className="bg-muted/50 p-3 rounded-xl border">
                 <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">Blood</p>
                 <p className="font-semibold text-primary flex items-center gap-1.5">
                   {user?.blood_group || 'N/A'}
                 </p>
               </div>
               <div className="bg-muted/50 p-3 rounded-xl border">
                 <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-0.5">Gender</p>
                 <p className="font-semibold text-primary capitalize flex items-center gap-1.5">
                   {user?.gender || 'N/A'}
                 </p>
               </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Edit Form */}
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl">Personal Information</CardTitle>
                <CardDescription>Update your contact and health information.</CardDescription>
              </div>
              <Button 
                variant={isEditing ? "outline" : "default"} 
                size="sm"
                onClick={() => {
                  if (isEditing) reset();
                  setIsEditing(!isEditing);
                }}
              >
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="name" 
                        className="pl-9" 
                        disabled={!isEditing} 
                        {...register('name', { required: 'Name is required' })} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                     <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="email" 
                        type="email" 
                        className="pl-9"
                        disabled={!isEditing} 
                        {...register('email', { required: 'Email is required' })} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="phone" 
                        type="tel" 
                        className="pl-9"
                        placeholder="+1 (555) 000-0000"
                        disabled={!isEditing} 
                        {...register('phone')} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                     <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                      <Input 
                        id="date_of_birth" 
                        type="date" 
                        className="pl-9"
                        disabled={!isEditing} 
                        {...register('date_of_birth')} 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="blood_group">Blood Group</Label>
                     <div className="relative">
                      <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <select 
                        id="blood_group"
                        disabled={!isEditing}
                        className={`flex w-full rounded-md border border-input bg-background pl-9 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''} h-10`}
                        {...register('blood_group')}
                      >
                         <option value="">Select Dropdown</option>
                         <option value="A+">A+</option>
                         <option value="A-">A-</option>
                         <option value="B+">B+</option>
                         <option value="B-">B-</option>
                         <option value="O+">O+</option>
                         <option value="O-">O-</option>
                         <option value="AB+">AB+</option>
                         <option value="AB-">AB-</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select 
                        id="gender"
                        disabled={!isEditing}
                        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        {...register('gender')}
                      >
                         <option value="">Select Gender</option>
                         <option value="male">Male</option>
                         <option value="female">Female</option>
                         <option value="other">Other</option>
                      </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <div className="relative">
                     <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                     <textarea
                       id="address"
                       className="flex min-h-[80px] w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                       disabled={!isEditing}
                       placeholder="123 Main St, City, State ZIP"
                       {...register('address')}
                     />
                  </div>
                </div>

                {isEditing && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button type="submit" className="gap-2" disabled={isLoading}>
                      <Save className="h-4 w-4" />
                      {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-destructive/20">
            <CardHeader>
               <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
               <CardDescription>Actions that could modify your account permanently.</CardDescription>
            </CardHeader>
            <CardContent>
               <Button variant="destructive" className="w-full sm:w-auto mt-2">
                 Reset Password
               </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
