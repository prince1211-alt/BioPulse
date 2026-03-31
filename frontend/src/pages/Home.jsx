import React from 'react';
import { FileText, Cpu, Salad, CalendarCheck, Shield, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';

export function Home() {
  const features = [
    {
      icon: <Cpu className="h-6 w-6 text-primary" />,
      title: "AI-Powered Diagnostics",
      description: "Get instant insights from your lab reports using our advanced AI algorithms."
    },
    {
      icon: <FileText className="h-6 w-6 text-primary" />,
      title: "Smart OCR",
      description: "Upload your physical reports and let our OCR technology digitize them instantly."
    },
    {
      icon: <Salad className="h-6 w-6 text-primary" />,
      title: "Personalized Diet Plans",
      description: "Receive AI-generated diet plans tailored to your specific health metrics."
    },
    {
      icon: <CalendarCheck className="h-6 w-6 text-primary" />,
      title: "Seamless Appointments",
      description: "Book and manage appointments with specialized doctors in a few clicks."
    },
    {
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: "Secure Data",
      description: "Your health records are encrypted and securely stored with premium protection."
    },
    {
      icon: <Zap className="h-6 w-6 text-primary" />,
      title: "Real-time Tracking",
      description: "Monitor your health score and get proactive alerts on critical anomalies."
    }
  ];

  const steps = [
    {
      title: "Upload Reports",
      description: "Simply snap a photo or upload your PDF lab reports to your secure vault.",
    },
    {
      title: "AI Analysis",
      description: "Our system instantly reads and analyzes all biomarkers to give you a clear summary.",
    },
    {
      title: "Get Recommendations",
      description: "Receive instant diet plans and book doctors based on your specific health needs.",
    }
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-background">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40">
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
            <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-accent opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
          </div>
          
          <div className="container mx-auto px-4 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto max-w-3xl">
              <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl text-balance">
                Your Intelligent Healthcare <span className="text-primary">Operating System</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-2xl mx-auto">
                BioPulse digitizes your lab reports, provides detailed AI health insights, generates custom diet plans, and connects you with the right specialists instantly.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link to="/signup">
                  <Button size="lg" className="gap-2 shadow-soft-md">
                    Get Started Free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="ghost" size="lg">Log in</Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <h2 className="text-base font-semibold leading-7 text-primary">Everything you need</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Platform Features</p>
              <p className="mt-4 text-lg text-muted-foreground">The most complete healthcare app tailored precisely for modern patients.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <motion.div 
                  key={index} 
                  initial={{ opacity: 0, y: 20 }} 
                  whileInView={{ opacity: 1, y: 0 }} 
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className="p-8 rounded-2xl border bg-card hover:shadow-soft-md transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-6">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-24 bg-background border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">How it Works</h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">Three simple steps to take full control of your health journey.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center max-w-5xl mx-auto">
              {steps.map((step, index) => (
                <div key={index} className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-soft z-10 relative">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-[60%] right-[-40%] h-[2px] bg-border -z-0"></div>
                  )}
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-primary py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl mb-6">
              Ready to modernize your healthcare?
            </h2>
            <p className="text-primary-foreground/80 mb-10 max-w-2xl mx-auto text-lg">
              Join thousands of users who have streamlined their health tracking and medical appointments with BioPulse.
            </p>
            <Link to="/signup">
              <Button size="lg" variant="secondary" className="gap-2 shadow-soft">
                Create Free Account
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
