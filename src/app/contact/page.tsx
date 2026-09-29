'use client';

import React, { useState } from 'react';
import { SCHOOL_PROFILE } from '@/lib/constants';
import { Navbar, PublicFooter, Button, Card, CardContent, Input, FormGroup } from '@/components';

export default function ContactPage() {
  const [inquirySent, setInquirySent] = useState(false);
  const [formData, setFormData] = useState({
    parentName: '',
    phoneOrEmail: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.parentName || !formData.phoneOrEmail || !formData.message) return;
    setInquirySent(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A]">
      <Navbar currentPath="/contact" />

      <main className="flex-1">
        {/* Page Banner */}
        <section className="bg-[#FDFBF7] border-b border-[#EADBDA] py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded text-xs font-bold uppercase tracking-wider">
              Get in Touch
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#5B0612]">
              Contact Swanford Academy
            </h1>
            <p className="text-sm sm:text-base text-[#524B46] max-w-2xl mx-auto">
              Our administrative office is open to parents and prospective guardians seeking admission guidance or academic information.
            </p>
          </div>
        </section>

        {/* Contact Info & Inquiry Form */}
        <section className="py-16 sm:py-20 bg-white border-b border-[#EADBDA]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* Left Column: School Information */}
              <div className="lg:col-span-6 space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-[#5B0612] mb-4">
                    School Location &amp; Administration
                  </h2>
                  <div className="bg-[#FDFBF7] p-6 sm:p-8 rounded-2xl border border-[#EADBDA] space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs uppercase tracking-wider text-[#8C827A] font-bold block">
                        Campus Address:
                      </span>
                      <p className="font-bold text-[#5B0612] text-base">{SCHOOL_PROFILE.name}</p>
                      <p className="text-sm text-[#524B46] leading-relaxed">{SCHOOL_PROFILE.address}</p>
                    </div>

                    <div className="pt-3 border-t border-[#EADBDA] space-y-1">
                      <span className="text-xs uppercase tracking-wider text-[#8C827A] font-bold block">
                        Proprietor &amp; Leadership:
                      </span>
                      <p className="text-sm font-semibold text-[#1C1A1A]">{SCHOOL_PROFILE.contactPerson}</p>
                    </div>

                    <div className="pt-3 border-t border-[#EADBDA] space-y-2">
                      <span className="text-xs uppercase tracking-wider text-[#8C827A] font-bold block">
                        Official School Schedule:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="bg-white p-3 rounded-xl border border-[#EADBDA]/80 space-y-1">
                          <p className="font-bold text-[#5B0612] text-xs pb-1 mb-1 border-b border-stone-100">Conventional Section</p>
                          <p className="text-stone-700 flex justify-between"><span>Mon &ndash; Thu:</span> <span className="font-bold text-stone-900">7:30am &ndash; 2:00pm</span></p>
                          <p className="text-stone-700 flex justify-between"><span>Friday:</span> <span className="font-bold text-stone-900">7:30am &ndash; 12:00pm</span></p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-[#EADBDA]/80 space-y-1">
                          <p className="font-bold text-[#5B0612] text-xs pb-1 mb-1 border-b border-stone-100">Tahfeez Section</p>
                          <p className="text-stone-700 flex justify-between"><span>Weekends:</span> <span className="font-bold text-stone-900">8:30am &ndash; 12:00pm</span></p>
                          <p className="text-stone-700 flex justify-between"><span>Mon &ndash; Wed:</span> <span className="font-bold text-stone-900">2:30pm &ndash; 5:30pm</span></p>
                        </div>
                      </div>
                    </div>


                  </div>
                </div>

              </div>

              {/* Right Column: Send an Inquiry */}
              <div className="lg:col-span-6">
                <Card className="bg-[#FDFBF7] border-[#EADBDA] shadow-xs">
                  <CardContent className="p-6 sm:p-8 space-y-6">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-[#5B0612]">
                        Send an Inquiry
                      </h2>
                      <p className="text-xs sm:text-sm text-[#524B46] mt-1">
                        Have a question about admissions, fees, or our Tahfeez programme? Leave a message for the admissions team.
                      </p>
                    </div>

                    {inquirySent ? (
                      <div className="p-6 bg-white rounded-xl border border-emerald-200 text-center space-y-3">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                          &#10003;
                        </div>
                        <h3 className="font-bold text-base text-[#5B0612]">Inquiry Submitted</h3>
                        <p className="text-xs text-[#524B46]">
                          Thank you. Your message has been received by the admissions office. We will get in touch with you shortly.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInquirySent(false);
                            setFormData({ parentName: '', phoneOrEmail: '', message: '' });
                          }}
                        >
                          Send Another Message
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <FormGroup label="Your Name (Parent / Guardian)" required>
                          <Input
                            placeholder="e.g. Mal. Abdullahi Garba"
                            value={formData.parentName}
                            onChange={(e) =>
                              setFormData({ ...formData, parentName: e.target.value })
                            }
                            required
                          />
                        </FormGroup>

                        <FormGroup label="Phone Number or Email Address" required>
                          <Input
                            placeholder="e.g. 0803 123 4567 or email@domain.com"
                            value={formData.phoneOrEmail}
                            onChange={(e) =>
                              setFormData({ ...formData, phoneOrEmail: e.target.value })
                            }
                            required
                          />
                        </FormGroup>

                        <FormGroup label="Message / Inquiry" required>
                          <textarea
                            className="w-full min-h-[120px] rounded-lg border border-[#EADBDA] bg-white px-3.5 py-2.5 text-sm text-[#1C1A1A] placeholder:text-[#8C827A] focus:outline-none focus:ring-2 focus:ring-[#5B0612]"
                            placeholder="Please specify child's prospective class or programme..."
                            value={formData.message}
                            onChange={(e) =>
                              setFormData({ ...formData, message: e.target.value })
                            }
                            required
                          />
                        </FormGroup>

                        <Button variant="primary" size="md" type="submit" className="w-full py-3">
                          Send Inquiry to Admissions Desk &rarr;
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
