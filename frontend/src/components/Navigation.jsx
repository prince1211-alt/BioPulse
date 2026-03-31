import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Activity, Menu, X } from 'lucide-react';
import { Button } from './ui/Button';

export function Navigation() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <Link to="/" className="text-xl font-bold tracking-tight text-primary">
            BioPulse
          </Link>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Home
          </NavLink>
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            How it Works
          </a>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link to="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link to="/signup">
            <Button>Sign Up</Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="md:hidden border-b bg-background p-4 flex flex-col gap-4">
          <NavLink to="/" className="text-sm font-medium block py-2" onClick={() => setIsOpen(false)}>Home</NavLink>
          <a href="#features" className="text-sm font-medium block py-2" onClick={() => setIsOpen(false)}>Features</a>
          <a href="#how-it-works" className="text-sm font-medium block py-2" onClick={() => setIsOpen(false)}>How it Works</a>
          <div className="flex flex-col gap-2 pt-4 border-t">
            <Link to="/login" onClick={() => setIsOpen(false)}>
              <Button variant="outline" className="w-full">Log in</Button>
            </Link>
            <Link to="/signup" onClick={() => setIsOpen(false)}>
              <Button className="w-full">Sign Up</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
