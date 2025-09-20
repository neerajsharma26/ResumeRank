import Image from 'next/image';
import * as React from 'react';

export const Logo = ({ className }: { className?: string }) => (
    <div className={className}>
        <Image src="/images/varahe-logo.png" alt="Hire Varahe Logo" width={40} height={40} />
    </div>
);
