import React from 'react';
import { motion } from 'framer-motion';
import { Wand2, Compass, Upload, ScrollText, DollarSign, Bot } from 'lucide-react';
import aiConcierge from '@/assets/ai-concierge-screenshot.webp';
import placesMaps from '@/assets/places-basecamps-screenshot.webp';
import { SectionHeader } from '../SectionHeader';

export const AiFeaturesSection = () => {
  // Group 1 - aligned with AI Concierge screenshot
  const aiFeatures1 = [
    {
      icon: <Wand2 className="text-accent" size={28} />,
      title: 'Context-Aware Concierge',
      description:
        'Your full trip context — itinerary, tasks, payments, places — woven into every answer. (For paid plans)',
    },
    {
      icon: <DollarSign className="text-primary" size={28} />,
      title: 'Payment Tracking',
      description: 'Who owes what — no spreadsheets. Settle splits with a single request.',
    },
    {
      icon: <Bot className="text-accent" size={28} />,
      title: 'ChravelApp Agent',
      description:
        'Takes action with the group in the loop: polls, broadcasts, calendars, expenses, and tasks.',
    },
  ];

  // Group 2 - aligned with Places screenshot
  const aiFeatures2 = [
    {
      icon: <Compass className="text-primary" size={28} />,
      title: 'BaseCamps',
      description: 'Store your Airbnb or hotel address once. Everyone has it.',
    },
    {
      icon: <Upload className="text-accent" size={28} />,
      title: 'Smart Import',
      description:
        'Import calendars, agendas & lineups from URLs — AI extracts schedules automatically. (Explorer+)',
    },
    {
      icon: <ScrollText className="text-primary" size={28} />,
      title: 'ChravelApp Recap PDFs',
      description: 'One-tap trip summary PDF.',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 tablet:py-0 flex flex-col items-center justify-start tablet:justify-center min-h-screen space-y-8 tablet:space-y-12">
      {/* Headline */}
      <SectionHeader
        eyebrow="Intelligent by Design"
        title={
          <>
            AI That <em>Knows</em> Your Trip
          </>
        }
        lede="Get answers with your trip's context — itinerary, budget, and more — not generic advice."
      />

      {/* Split Layout: 2 Rows with Screenshot + 3 Pills each */}
      <div className="max-w-7xl w-full space-y-6 tablet:space-y-8">
        {/* Row 1: AI Concierge Screenshot + 3 Pills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 tablet:gap-8 items-stretch">
          {/* Left: AI Concierge Screenshot */}
          <motion.div
            className="rounded-2xl overflow-hidden shadow-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 min-h-[300px] lg:min-h-[380px] bg-card flex items-center"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <img
              src={aiConcierge}
              alt="AI Concierge providing personalized recommendations"
              className="w-full h-auto object-contain"
              loading="lazy"
              decoding="async"
            />
          </motion.div>

          {/* Right: 3 Pills matching screenshot height */}
          <motion.div
            className="grid grid-rows-3 gap-3 sm:gap-4 min-h-[300px] lg:min-h-[380px]"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {aiFeatures1.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                className="group relative overflow-hidden bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 hover:border-accent/50 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 transition-[border-color,box-shadow,transform] duration-300 flex items-center"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="bg-accent/10 p-3 rounded-xl group-hover:bg-accent/20 transition-colors flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg sm:text-xl mb-1 leading-tight">
                      {feature.title}
                    </h3>
                    <p className="text-sm sm:text-base text-foreground leading-relaxed font-medium">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Row 2: Places Screenshot + 3 Pills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 tablet:gap-8 items-stretch">
          {/* Left: Places Screenshot */}
          <motion.div
            className="rounded-2xl overflow-hidden shadow-2xl border border-border/50 hover:border-accent/30 transition-all duration-300 min-h-[300px] lg:min-h-[380px] bg-card flex items-center"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <img
              src={placesMaps}
              alt="BaseCamps and Places exploration with maps"
              className="w-full h-auto object-contain"
              loading="lazy"
              decoding="async"
            />
          </motion.div>

          {/* Right: 3 Pills matching screenshot height */}
          <motion.div
            className="grid grid-rows-3 gap-3 sm:gap-4 min-h-[300px] lg:min-h-[380px]"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {aiFeatures2.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                className="group relative overflow-hidden bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4 hover:border-accent/50 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 transition-[border-color,box-shadow,transform] duration-300 flex items-center"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="bg-accent/10 p-3 rounded-xl group-hover:bg-accent/20 transition-colors flex-shrink-0">
                    {feature.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg sm:text-xl mb-1 leading-tight">
                      {feature.title}
                    </h3>
                    <p className="text-sm sm:text-base text-foreground leading-relaxed font-medium">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
